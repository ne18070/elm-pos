-- ─── Legal Workflow Builder ───────────────────────────────────────────────────
-- Migration 082 : workflows, instances, history

-- ─── workflows ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflows (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  description TEXT,
  definition  JSONB       NOT NULL DEFAULT '{"nodes":[],"edges":[],"initial_node_id":""}',
  version     INT         NOT NULL DEFAULT 1,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_by  UUID        REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── workflow_instances ───────────────────────────────────────────────────────
-- workflow_snapshot garantit l'immutabilité : même si la définition change,
-- les dossiers en cours continuent sur la version qu'ils ont commencée.
CREATE TABLE IF NOT EXISTS workflow_instances (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id          UUID        NOT NULL,   -- référence externe (dossiers juridiques)
  workflow_id         UUID        NOT NULL REFERENCES workflows(id),
  workflow_version    INT         NOT NULL,   -- version au moment du démarrage
  workflow_snapshot   JSONB       NOT NULL,   -- copie complète de la définition
  current_node_id     TEXT        NOT NULL,
  context             JSONB       NOT NULL DEFAULT '{}',
  status              TEXT        NOT NULL DEFAULT 'RUNNING'
                        CHECK (status IN ('RUNNING', 'WAITING', 'COMPLETED', 'CANCELLED')),
  started_by          UUID        REFERENCES auth.users(id),
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_instances_dossier   ON workflow_instances(dossier_id);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_status    ON workflow_instances(status);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_workflow   ON workflow_instances(workflow_id);

-- ─── workflow_history ─────────────────────────────────────────────────────────
-- Audit trail immuable : on n'update jamais, on append uniquement.
CREATE TABLE IF NOT EXISTS workflow_history (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id      UUID        NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  from_node_id     TEXT,                 -- NULL pour la transition initiale
  to_node_id       TEXT        NOT NULL,
  edge_id          TEXT,
  action_label     TEXT,
  context_snapshot JSONB       NOT NULL, -- état du contexte au moment de la transition
  performed_by     UUID        REFERENCES auth.users(id),
  performed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata         JSONB       NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_workflow_history_instance ON workflow_history(instance_id);
CREATE INDEX IF NOT EXISTS idx_workflow_history_time     ON workflow_history(performed_at DESC);

-- ─── Trigger updated_at ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER workflows_updated_at
  BEFORE UPDATE ON workflows
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER workflow_instances_updated_at
  BEFORE UPDATE ON workflow_instances
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE workflows          ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_history   ENABLE ROW LEVEL SECURITY;

-- Les membres du business peuvent lire les workflows actifs
CREATE POLICY "read workflows" ON workflows
  FOR SELECT TO authenticated
  USING (
    business_id IN (
      SELECT business_id FROM business_members WHERE user_id = auth.uid()
    )
  );

-- Seul un manager/owner peut créer ou modifier
CREATE POLICY "manage workflows" ON workflows
  FOR ALL TO authenticated
  USING (
    business_id IN (
      SELECT business_id FROM business_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'manager', 'admin')
    )
  )
  WITH CHECK (
    business_id IN (
      SELECT business_id FROM business_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'manager', 'admin')
    )
  );

-- Les membres du business peuvent lire et créer des instances
CREATE POLICY "read workflow_instances" ON workflow_instances
  FOR SELECT TO authenticated
  USING (
    workflow_id IN (
      SELECT id FROM workflows WHERE business_id IN (
        SELECT business_id FROM business_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "manage workflow_instances" ON workflow_instances
  FOR ALL TO authenticated
  USING (
    workflow_id IN (
      SELECT id FROM workflows WHERE business_id IN (
        SELECT business_id FROM business_members WHERE user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    workflow_id IN (
      SELECT id FROM workflows WHERE business_id IN (
        SELECT business_id FROM business_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "read workflow_history" ON workflow_history
  FOR SELECT TO authenticated
  USING (
    instance_id IN (
      SELECT id FROM workflow_instances WHERE workflow_id IN (
        SELECT id FROM workflows WHERE business_id IN (
          SELECT business_id FROM business_members WHERE user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "insert workflow_history" ON workflow_history
  FOR INSERT TO authenticated
  WITH CHECK (
    instance_id IN (
      SELECT id FROM workflow_instances WHERE workflow_id IN (
        SELECT id FROM workflows WHERE business_id IN (
          SELECT business_id FROM business_members WHERE user_id = auth.uid()
        )
      )
    )
  );
