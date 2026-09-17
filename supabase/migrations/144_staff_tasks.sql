-- ============================================================================
-- Migration 144 : Module RH — Tâches et demandes ("Vos tâches et demandes")
--
-- Table de tâches assignables entre employés (pas seulement admin → employé) :
-- un employé peut créer une tâche pour un collègue, et voir à la fois ses
-- tâches assignées et celles qu'il a créées. created_by référence users(id)
-- (pas staff(id)) car un compte admin/owner n'a pas forcément de fiche staff
-- liée (getMyStaffRecord renvoie null pour ces comptes) — avec staff_id il
-- serait impossible pour un admin non lié de créer/assigner une tâche.
-- ============================================================================

CREATE TABLE IF NOT EXISTS staff_tasks (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  assigned_to   UUID        NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  created_by    UUID        REFERENCES users(id),
  title         TEXT        NOT NULL,
  description   TEXT,
  status        TEXT        NOT NULL DEFAULT 'a_faire' CHECK (status IN ('a_faire', 'en_cours', 'terminee', 'annulee')),
  priority      TEXT        NOT NULL DEFAULT 'normale' CHECK (priority IN ('basse', 'normale', 'haute')),
  due_date      DATE,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS staff_tasks_assigned_idx ON staff_tasks(assigned_to, status);
CREATE INDEX IF NOT EXISTS staff_tasks_created_idx  ON staff_tasks(created_by);
CREATE INDEX IF NOT EXISTS staff_tasks_biz_idx       ON staff_tasks(business_id, status);

ALTER TABLE staff_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_tasks_select" ON staff_tasks;
CREATE POLICY "staff_tasks_select" ON staff_tasks FOR SELECT TO authenticated
  USING (
    business_id = get_user_business_id() AND (
      EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner', 'manager') OR is_superadmin = true))
      OR EXISTS (SELECT 1 FROM staff s WHERE s.id = staff_tasks.assigned_to AND s.user_id = auth.uid())
      OR staff_tasks.created_by = auth.uid()
    )
  );

-- Assignation ouverte à tout membre du business (délégation entre collègues,
-- pas seulement admin → employé) : created_by doit être l'appelant, et la
-- cible (assigned_to) doit être un employé du même business.
DROP POLICY IF EXISTS "staff_tasks_insert" ON staff_tasks;
CREATE POLICY "staff_tasks_insert" ON staff_tasks FOR INSERT TO authenticated
  WITH CHECK (
    business_id = get_user_business_id()
    AND created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM staff s WHERE s.id = staff_tasks.assigned_to AND s.business_id = get_user_business_id())
  );

DROP POLICY IF EXISTS "staff_tasks_update" ON staff_tasks;
CREATE POLICY "staff_tasks_update" ON staff_tasks FOR UPDATE TO authenticated
  USING (
    business_id = get_user_business_id() AND (
      EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner', 'manager') OR is_superadmin = true))
      OR EXISTS (SELECT 1 FROM staff s WHERE s.id = staff_tasks.assigned_to AND s.user_id = auth.uid())
      OR staff_tasks.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "staff_tasks_delete" ON staff_tasks;
CREATE POLICY "staff_tasks_delete" ON staff_tasks FOR DELETE TO authenticated
  USING (
    business_id = get_user_business_id() AND (
      EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner', 'manager') OR is_superadmin = true))
      OR staff_tasks.created_by = auth.uid()
    )
  );

CREATE TRIGGER staff_tasks_updated_at BEFORE UPDATE ON staff_tasks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staff_tasks TO authenticated;
GRANT ALL ON TABLE public.staff_tasks TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
