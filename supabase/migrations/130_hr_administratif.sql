-- ============================================================================
-- Migration 130 : Module RH — Volet Administratif
-- Organigramme, contrats, coffre-fort documentaire employé, checklists
-- d'onboarding/offboarding.
--
-- Purement additif : nouvelles colonnes nullable sur `staff`, nouvelles
-- tables. Aucune table/colonne existante n'est modifiée ou supprimée — le
-- module /staff actuel continue de fonctionner sans changement.
-- ============================================================================

-- ── 1. Organigramme + contrat sur `staff` ──────────────────────────────────

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS manager_id          UUID REFERENCES staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contract_type       TEXT,
  ADD COLUMN IF NOT EXISTS contract_start_date DATE,
  ADD COLUMN IF NOT EXISTS contract_end_date   DATE,
  ADD COLUMN IF NOT EXISTS probation_end_date  DATE,
  ADD COLUMN IF NOT EXISTS termination_date    DATE,
  ADD COLUMN IF NOT EXISTS termination_reason  TEXT;

CREATE INDEX IF NOT EXISTS staff_manager_id_idx ON staff(manager_id);

-- ── 2. Coffre-fort documentaire employé ────────────────────────────────────

CREATE TABLE IF NOT EXISTS staff_documents (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id        UUID        NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  uploaded_by     UUID        REFERENCES users(id),
  category        TEXT        NOT NULL DEFAULT 'autre', -- contrat, identite, diplome, avenant, autre
  nom             TEXT        NOT NULL,
  storage_path    TEXT        NOT NULL,
  mime_type       TEXT,
  taille_bytes    BIGINT      NOT NULL DEFAULT 0,
  is_confidential BOOLEAN     NOT NULL DEFAULT false, -- si true, invisible en self-service employé
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS staff_documents_staff_id_idx    ON staff_documents(staff_id);
CREATE INDEX IF NOT EXISTS staff_documents_business_id_idx ON staff_documents(business_id);

ALTER TABLE staff_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_documents_select" ON staff_documents;
CREATE POLICY "staff_documents_select" ON staff_documents FOR SELECT TO authenticated
  USING (
    business_id = get_user_business_id() AND (
      EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner', 'manager') OR is_superadmin = true))
      OR (
        NOT is_confidential
        AND EXISTS (SELECT 1 FROM staff s WHERE s.id = staff_documents.staff_id AND s.user_id = auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "staff_documents_write_admin" ON staff_documents;
CREATE POLICY "staff_documents_write_admin" ON staff_documents FOR ALL TO authenticated
  USING (
    business_id = get_user_business_id()
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner', 'manager') OR is_superadmin = true))
  )
  WITH CHECK (
    business_id = get_user_business_id()
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner', 'manager') OR is_superadmin = true))
  );

-- Compteur de stockage partagé (même mécanisme que dossier_fichiers)
DROP TRIGGER IF EXISTS trg_staff_documents_storage_used ON staff_documents;
CREATE TRIGGER trg_staff_documents_storage_used
  AFTER INSERT OR DELETE ON staff_documents
  FOR EACH ROW EXECUTE FUNCTION update_storage_used();

-- Bucket Storage 'staff-documents' (path : {business_id}/{staff_id}/{filename})
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('staff-documents', 'staff-documents', false, 52428800) -- 50 Mo
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "staff_documents_storage_select" ON storage.objects;
CREATE POLICY "staff_documents_storage_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'staff-documents' AND
    (storage.foldername(name))[1]::uuid IN (
      SELECT business_id FROM public.business_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "staff_documents_storage_insert" ON storage.objects;
CREATE POLICY "staff_documents_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'staff-documents' AND
    (storage.foldername(name))[1]::uuid IN (
      SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'manager')
    )
  );

DROP POLICY IF EXISTS "staff_documents_storage_delete" ON storage.objects;
CREATE POLICY "staff_documents_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'staff-documents' AND
    (storage.foldername(name))[1]::uuid IN (
      SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'manager')
    )
  );

-- ── 3. Checklists onboarding / offboarding ─────────────────────────────────

CREATE TABLE IF NOT EXISTS staff_checklist_templates (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  type         TEXT        NOT NULL CHECK (type IN ('onboarding', 'offboarding')),
  label        TEXT        NOT NULL,
  order_index  INT         NOT NULL DEFAULT 0,
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff_checklist_items (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id     UUID        NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  type         TEXT        NOT NULL CHECK (type IN ('onboarding', 'offboarding')),
  label        TEXT        NOT NULL,
  order_index  INT         NOT NULL DEFAULT 0,
  is_done      BOOLEAN     NOT NULL DEFAULT false,
  done_at      TIMESTAMPTZ,
  done_by      UUID        REFERENCES users(id),
  due_date     DATE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS staff_checklist_templates_biz_idx ON staff_checklist_templates(business_id, type);
CREATE INDEX IF NOT EXISTS staff_checklist_items_staff_idx   ON staff_checklist_items(staff_id, type);

ALTER TABLE staff_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_checklist_items     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_checklist_templates_select" ON staff_checklist_templates;
CREATE POLICY "staff_checklist_templates_select" ON staff_checklist_templates FOR SELECT TO authenticated
  USING (business_id = get_user_business_id());

DROP POLICY IF EXISTS "staff_checklist_templates_write_admin" ON staff_checklist_templates;
CREATE POLICY "staff_checklist_templates_write_admin" ON staff_checklist_templates FOR ALL TO authenticated
  USING (business_id = get_user_business_id() AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner') OR is_superadmin = true)))
  WITH CHECK (business_id = get_user_business_id() AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner') OR is_superadmin = true)));

DROP POLICY IF EXISTS "staff_checklist_items_select" ON staff_checklist_items;
CREATE POLICY "staff_checklist_items_select" ON staff_checklist_items FOR SELECT TO authenticated
  USING (
    business_id = get_user_business_id() AND (
      EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner', 'manager') OR is_superadmin = true))
      OR EXISTS (SELECT 1 FROM staff s WHERE s.id = staff_checklist_items.staff_id AND s.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "staff_checklist_items_write_admin" ON staff_checklist_items;
CREATE POLICY "staff_checklist_items_write_admin" ON staff_checklist_items FOR ALL TO authenticated
  USING (business_id = get_user_business_id() AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner', 'manager') OR is_superadmin = true)))
  WITH CHECK (business_id = get_user_business_id() AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner', 'manager') OR is_superadmin = true)));

CREATE TRIGGER staff_checklist_templates_updated_at BEFORE UPDATE ON staff_checklist_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 4. GRANTs explicites (obligatoire depuis mai 2026, cf. 085_loyalty.sql) ─

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staff_documents            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staff_checklist_templates  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staff_checklist_items      TO authenticated;
GRANT ALL ON TABLE public.staff_documents           TO service_role;
GRANT ALL ON TABLE public.staff_checklist_templates TO service_role;
GRANT ALL ON TABLE public.staff_checklist_items     TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
