-- ============================================================================
-- Migration 145 : Module RH — Objectifs ("Vos objectifs")
--
-- Un objectif est assigné par un manager/admin (INSERT réservé à ce rôle),
-- l'employé peut ensuite auto-déclarer sa progression (en_cours/atteint/
-- non_atteint) — l'admin garde la capacité de tout modifier/supprimer.
-- ============================================================================

CREATE TABLE IF NOT EXISTS staff_objectives (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id       UUID        NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  assigned_by    UUID        REFERENCES users(id),
  title          TEXT        NOT NULL,
  description    TEXT,
  target_date    DATE,
  status         TEXT        NOT NULL DEFAULT 'assigne' CHECK (status IN ('assigne', 'en_cours', 'atteint', 'non_atteint')),
  achieved_at    TIMESTAMPTZ,
  achieved_note  TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS staff_objectives_staff_idx ON staff_objectives(staff_id, status);
CREATE INDEX IF NOT EXISTS staff_objectives_biz_idx   ON staff_objectives(business_id);

ALTER TABLE staff_objectives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_objectives_select" ON staff_objectives;
CREATE POLICY "staff_objectives_select" ON staff_objectives FOR SELECT TO authenticated
  USING (
    business_id = get_user_business_id() AND (
      EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner', 'manager') OR is_superadmin = true))
      OR EXISTS (SELECT 1 FROM staff s WHERE s.id = staff_objectives.staff_id AND s.user_id = auth.uid())
    )
  );

-- INSERT réservé admin/manager : un objectif est assigné, pas auto-créé par l'employé.
DROP POLICY IF EXISTS "staff_objectives_insert_admin" ON staff_objectives;
CREATE POLICY "staff_objectives_insert_admin" ON staff_objectives FOR INSERT TO authenticated
  WITH CHECK (
    business_id = get_user_business_id()
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner', 'manager') OR is_superadmin = true))
    AND EXISTS (SELECT 1 FROM staff s WHERE s.id = staff_objectives.staff_id AND s.business_id = get_user_business_id())
  );

-- UPDATE : admin/manager en override complet, OU l'employé assigné pour auto-déclarer sa progression.
DROP POLICY IF EXISTS "staff_objectives_update" ON staff_objectives;
CREATE POLICY "staff_objectives_update" ON staff_objectives FOR UPDATE TO authenticated
  USING (
    business_id = get_user_business_id() AND (
      EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner', 'manager') OR is_superadmin = true))
      OR EXISTS (SELECT 1 FROM staff s WHERE s.id = staff_objectives.staff_id AND s.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "staff_objectives_delete_admin" ON staff_objectives;
CREATE POLICY "staff_objectives_delete_admin" ON staff_objectives FOR DELETE TO authenticated
  USING (
    business_id = get_user_business_id()
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner', 'manager') OR is_superadmin = true))
  );

CREATE TRIGGER staff_objectives_updated_at BEFORE UPDATE ON staff_objectives FOR EACH ROW EXECUTE FUNCTION set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staff_objectives TO authenticated;
GRANT ALL ON TABLE public.staff_objectives TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
