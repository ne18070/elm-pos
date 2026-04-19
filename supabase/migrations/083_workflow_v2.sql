-- ─── Workflow Engine v2 ───────────────────────────────────────────────────────
-- Migration 083 : amélioration instances, queue, pretentions, tracking

-- ─── workflow_instances : nouveaux champs ─────────────────────────────────────
ALTER TABLE workflow_instances
  ADD COLUMN IF NOT EXISTS retry_count          INT         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error           TEXT,
  ADD COLUMN IF NOT EXISTS paused_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_resume_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS triggered_by         TEXT;       -- 'ON_DOSSIER_CREATE' | 'MANUAL' | etc.

-- Étendre les statuts (PENDING et FAILED manquaient)
ALTER TABLE workflow_instances
  DROP CONSTRAINT IF EXISTS workflow_instances_status_check;
ALTER TABLE workflow_instances
  ADD  CONSTRAINT workflow_instances_status_check
  CHECK (status IN ('PENDING','RUNNING','WAITING','COMPLETED','FAILED','PAUSED','CANCELLED'));

-- ─── workflow_logs : audit enrichi (remplace workflow_history) ────────────────
CREATE TABLE IF NOT EXISTS workflow_logs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id      UUID        NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  level            TEXT        NOT NULL DEFAULT 'INFO'
                     CHECK (level IN ('DEBUG','INFO','WARN','ERROR')),
  event_type       TEXT        NOT NULL,
    -- TRANSITION | ACTION_EXEC | ERROR | RETRY | PAUSE | RESUME | TRIGGER
  from_node_id     TEXT,
  to_node_id       TEXT,
  edge_id          TEXT,
  message          TEXT,
  context_snapshot JSONB       NOT NULL DEFAULT '{}',
  error_details    JSONB,
  performed_by     UUID        REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wlogs_instance ON workflow_logs(instance_id);
CREATE INDEX IF NOT EXISTS idx_wlogs_time     ON workflow_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wlogs_errors   ON workflow_logs(instance_id) WHERE level = 'ERROR';

-- ─── workflow_jobs : queue asynchrone (pattern BullMQ sur Supabase) ───────────
CREATE TABLE IF NOT EXISTS workflow_jobs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id   UUID        NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  job_type      TEXT        NOT NULL,
    -- PROCESS_NODE | SEND_NOTIFICATION | GENERATE_DOC | CALL_WEBHOOK | RESUME_DELAY
  payload       JSONB       NOT NULL DEFAULT '{}',
  status        TEXT        NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING','PROCESSING','DONE','FAILED')),
  priority      INT         NOT NULL DEFAULT 5,  -- 1 (haute) → 10 (basse)
  retry_count   INT         NOT NULL DEFAULT 0,
  max_retries   INT         NOT NULL DEFAULT 3,
  last_error    TEXT,
  process_after TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_wjobs_pending  ON workflow_jobs(process_after, priority)
  WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_wjobs_instance ON workflow_jobs(instance_id);

-- ─── pretentions : bibliothèque de blocs juridiques réutilisables ─────────────
CREATE TABLE IF NOT EXISTS pretentions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  category    TEXT,          -- 'mise_en_demeure' | 'relance' | 'assignation' | ...
  description TEXT,
  template    TEXT        NOT NULL,  -- texte juridique avec {{variables}}
  variables   JSONB       NOT NULL DEFAULT '[]',
    -- [{ "key": "nom_client", "label": "Nom du client", "type": "text", "required": true }]
  tags        TEXT[]      NOT NULL DEFAULT '{}',
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_by  UUID        REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pretentions_business  ON pretentions(business_id);
CREATE INDEX IF NOT EXISTS idx_pretentions_category  ON pretentions(business_id, category);

-- ─── workflow_triggers ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_triggers (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id  UUID        NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  trigger_type TEXT        NOT NULL
    CHECK (trigger_type IN ('ON_DOSSIER_CREATE','ON_STEP_CHANGE','TIMER','EXTERNAL_EVENT')),
  config       JSONB       NOT NULL DEFAULT '{}',
    -- TIMER  : { "cron": "0 9 * * 1" }
    -- TIMER  : { "delay_hours": 48 }
    -- EXTERNAL_EVENT : { "event_key": "whatsapp_reply" }
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── workflow_documents : fichiers générés ────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_documents (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id  UUID        NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  node_id      TEXT        NOT NULL,
  name         TEXT        NOT NULL,
  storage_path TEXT        NOT NULL,  -- chemin Supabase Storage
  mime_type    TEXT        NOT NULL DEFAULT 'application/pdf',
  size_bytes   BIGINT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by UUID        REFERENCES auth.users(id)
);

-- ─── client_tracking_tokens : suivi client sécurisé ──────────────────────────
CREATE TABLE IF NOT EXISTS client_tracking_tokens (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token        TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  dossier_id   UUID        NOT NULL,
  instance_id  UUID        REFERENCES workflow_instances(id) ON DELETE SET NULL,
  client_phone TEXT,
  client_email TEXT,
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  last_viewed  TIMESTAMPTZ,
  view_count   INT         NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tracking_token   ON client_tracking_tokens(token);
CREATE INDEX IF NOT EXISTS idx_tracking_dossier ON client_tracking_tokens(dossier_id);

-- ─── Trigger updated_at pour pretentions ──────────────────────────────────────
CREATE TRIGGER pretentions_updated_at
  BEFORE UPDATE ON pretentions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE workflow_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_jobs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pretentions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_documents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_tracking_tokens ENABLE ROW LEVEL SECURITY;

-- workflow_logs
CREATE POLICY "read workflow_logs" ON workflow_logs FOR SELECT TO authenticated USING (
  instance_id IN (SELECT id FROM workflow_instances WHERE workflow_id IN (
    SELECT id FROM workflows WHERE business_id IN (
      SELECT business_id FROM business_members WHERE user_id = auth.uid()
    )
  ))
);
CREATE POLICY "insert workflow_logs" ON workflow_logs FOR INSERT TO authenticated WITH CHECK (
  instance_id IN (SELECT id FROM workflow_instances WHERE workflow_id IN (
    SELECT id FROM workflows WHERE business_id IN (
      SELECT business_id FROM business_members WHERE user_id = auth.uid()
    )
  ))
);

-- workflow_jobs
CREATE POLICY "manage workflow_jobs" ON workflow_jobs FOR ALL TO authenticated
  USING (instance_id IN (SELECT id FROM workflow_instances WHERE workflow_id IN (
    SELECT id FROM workflows WHERE business_id IN (
      SELECT business_id FROM business_members WHERE user_id = auth.uid()
    )
  )))
  WITH CHECK (instance_id IN (SELECT id FROM workflow_instances WHERE workflow_id IN (
    SELECT id FROM workflows WHERE business_id IN (
      SELECT business_id FROM business_members WHERE user_id = auth.uid()
    )
  )));

-- pretentions
CREATE POLICY "read pretentions" ON pretentions FOR SELECT TO authenticated
  USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));
CREATE POLICY "manage pretentions" ON pretentions FOR ALL TO authenticated
  USING (business_id IN (
    SELECT business_id FROM business_members WHERE user_id = auth.uid() AND role IN ('owner','manager','admin')
  ))
  WITH CHECK (business_id IN (
    SELECT business_id FROM business_members WHERE user_id = auth.uid() AND role IN ('owner','manager','admin')
  ));

-- workflow_documents
CREATE POLICY "read workflow_documents" ON workflow_documents FOR SELECT TO authenticated USING (
  instance_id IN (SELECT id FROM workflow_instances WHERE workflow_id IN (
    SELECT id FROM workflows WHERE business_id IN (
      SELECT business_id FROM business_members WHERE user_id = auth.uid()
    )
  ))
);

-- client_tracking_tokens : lecture publique via token valide
CREATE POLICY "public view tracking" ON client_tracking_tokens
  FOR SELECT USING (expires_at > now());
CREATE POLICY "manage tracking tokens" ON client_tracking_tokens FOR ALL TO authenticated
  USING (dossier_id IN (
    -- vérification par dossier_id si tu as une table dossiers
    -- sinon, autoriser tous les membres authentifiés
    SELECT gen_random_uuid() WHERE true  -- placeholder : adapter à ta table dossiers
  ));
