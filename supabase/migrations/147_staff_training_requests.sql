-- ============================================================================
-- Migration 147 : Module RH — Formation ("Définissez vos besoins en formation,
-- effectuez vos demandes de formation")
--
-- Un seul modèle couvre les deux cas demandés : `is_need_only = true` pour un
-- simple besoin exprimé (pas de session précise visée), `false` pour une
-- demande concrète (avec période souhaitée). Même schéma RLS que
-- leave_requests après son durcissement (143) : lecture self+admin/manager,
-- insertion self (ou admin/owner pour créer au nom d'un employé), écriture
-- admin uniquement — pas d'auto-annulation, cohérent avec leave_requests qui
-- n'en a pas non plus.
-- ============================================================================

CREATE TABLE IF NOT EXISTS staff_training_requests (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id              UUID        NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  title                 TEXT        NOT NULL,
  is_need_only          BOOLEAN     NOT NULL DEFAULT false,
  desired_period_start  DATE,
  desired_period_end    DATE,
  justification         TEXT,
  status                TEXT        NOT NULL DEFAULT 'exprime' CHECK (status IN ('exprime', 'en_attente', 'approuvee', 'rejetee', 'realisee')),
  admin_notes           TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT staff_training_requests_valid_period CHECK (
    desired_period_start IS NULL OR desired_period_end IS NULL OR desired_period_end >= desired_period_start
  )
);

CREATE INDEX IF NOT EXISTS staff_training_requests_staff_idx ON staff_training_requests(staff_id, status);
CREATE INDEX IF NOT EXISTS staff_training_requests_biz_idx   ON staff_training_requests(business_id, is_need_only);

ALTER TABLE staff_training_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_training_requests_select" ON staff_training_requests;
CREATE POLICY "staff_training_requests_select" ON staff_training_requests FOR SELECT TO authenticated
  USING (
    business_id = get_user_business_id() AND (
      EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner', 'manager') OR is_superadmin = true))
      OR EXISTS (SELECT 1 FROM staff s WHERE s.id = staff_training_requests.staff_id AND s.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "staff_training_requests_insert" ON staff_training_requests;
CREATE POLICY "staff_training_requests_insert" ON staff_training_requests FOR INSERT TO authenticated
  WITH CHECK (
    business_id = get_user_business_id()
    AND EXISTS (
      SELECT 1 FROM staff s WHERE s.id = staff_training_requests.staff_id AND s.business_id = get_user_business_id()
        AND (s.user_id = auth.uid() OR (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'owner'))
    )
  );

DROP POLICY IF EXISTS "staff_training_requests_update_admin" ON staff_training_requests;
CREATE POLICY "staff_training_requests_update_admin" ON staff_training_requests FOR UPDATE TO authenticated
  USING (business_id = get_user_business_id() AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner', 'manager') OR is_superadmin = true)));

DROP POLICY IF EXISTS "staff_training_requests_delete_admin" ON staff_training_requests;
CREATE POLICY "staff_training_requests_delete_admin" ON staff_training_requests FOR DELETE TO authenticated
  USING (business_id = get_user_business_id() AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner') OR is_superadmin = true)));

CREATE TRIGGER staff_training_requests_updated_at BEFORE UPDATE ON staff_training_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staff_training_requests TO authenticated;
GRANT ALL ON TABLE public.staff_training_requests TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
