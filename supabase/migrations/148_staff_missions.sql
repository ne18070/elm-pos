-- ============================================================================
-- Migration 148 : Module RH — Mission ("Effectuez vos demandes d'ordre de
-- mission, listez les missions dont vous étiez membres")
--
-- Une mission a un demandeur (requested_by) et zéro ou plusieurs participants
-- supplémentaires (staff_mission_members) : un employé peut donc apparaître
-- dans "mes missions" soit comme demandeur, soit comme simple membre ajouté
-- par un admin/manager. staff_mission_members n'a pas de business_id propre
-- — la portée business passe par une jointure sur staff_missions, même
-- schéma que staff_payment_lines (132).
-- ============================================================================

CREATE TABLE IF NOT EXISTS staff_missions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  requested_by  UUID        NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  destination   TEXT        NOT NULL,
  objet         TEXT        NOT NULL,
  start_date    DATE        NOT NULL,
  end_date      DATE        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'en_attente' CHECK (status IN ('en_attente', 'approuvee', 'rejetee', 'terminee')),
  admin_notes   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT staff_missions_valid_dates CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS staff_mission_members (
  mission_id  UUID        NOT NULL REFERENCES staff_missions(id) ON DELETE CASCADE,
  staff_id    UUID        NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (mission_id, staff_id)
);

CREATE INDEX IF NOT EXISTS staff_missions_biz_idx ON staff_missions(business_id, status);
CREATE INDEX IF NOT EXISTS staff_missions_req_idx ON staff_missions(requested_by);
CREATE INDEX IF NOT EXISTS staff_mission_members_staff_idx ON staff_mission_members(staff_id);

ALTER TABLE staff_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_mission_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_missions_select" ON staff_missions;
CREATE POLICY "staff_missions_select" ON staff_missions FOR SELECT TO authenticated
  USING (
    business_id = get_user_business_id() AND (
      EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner', 'manager') OR is_superadmin = true))
      OR EXISTS (SELECT 1 FROM staff s WHERE s.id = staff_missions.requested_by AND s.user_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM staff_mission_members m JOIN staff s ON s.id = m.staff_id
        WHERE m.mission_id = staff_missions.id AND s.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "staff_missions_insert" ON staff_missions;
CREATE POLICY "staff_missions_insert" ON staff_missions FOR INSERT TO authenticated
  WITH CHECK (
    business_id = get_user_business_id()
    AND EXISTS (
      SELECT 1 FROM staff s WHERE s.id = staff_missions.requested_by AND s.business_id = get_user_business_id()
        AND (s.user_id = auth.uid() OR (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'owner'))
    )
  );

DROP POLICY IF EXISTS "staff_missions_update_admin" ON staff_missions;
CREATE POLICY "staff_missions_update_admin" ON staff_missions FOR UPDATE TO authenticated
  USING (business_id = get_user_business_id() AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner', 'manager') OR is_superadmin = true)));

DROP POLICY IF EXISTS "staff_missions_delete_admin" ON staff_missions;
CREATE POLICY "staff_missions_delete_admin" ON staff_missions FOR DELETE TO authenticated
  USING (business_id = get_user_business_id() AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner') OR is_superadmin = true)));

CREATE TRIGGER staff_missions_updated_at BEFORE UPDATE ON staff_missions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- staff_mission_members : portée via jointure sur le parent (pas de business_id propre).
DROP POLICY IF EXISTS "staff_mission_members_select" ON staff_mission_members;
CREATE POLICY "staff_mission_members_select" ON staff_mission_members FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff_missions sm WHERE sm.id = staff_mission_members.mission_id AND sm.business_id = get_user_business_id()
      AND (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner', 'manager') OR is_superadmin = true))
        OR EXISTS (SELECT 1 FROM staff s WHERE s.id = staff_mission_members.staff_id AND s.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM staff s2 WHERE s2.id = sm.requested_by AND s2.user_id = auth.uid())
      )
    )
  );

-- INSERT : admin/manager peut ajouter n'importe qui, le demandeur ne peut que
-- s'auto-inscrire (pas ajouter un collègue arbitraire).
DROP POLICY IF EXISTS "staff_mission_members_insert" ON staff_mission_members;
CREATE POLICY "staff_mission_members_insert" ON staff_mission_members FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM staff_missions sm WHERE sm.id = staff_mission_members.mission_id AND sm.business_id = get_user_business_id()
      AND (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner', 'manager') OR is_superadmin = true))
        OR (
          EXISTS (SELECT 1 FROM staff s WHERE s.id = sm.requested_by AND s.user_id = auth.uid())
          AND EXISTS (SELECT 1 FROM staff s2 WHERE s2.id = staff_mission_members.staff_id AND s2.user_id = auth.uid())
        )
      )
    )
  );

DROP POLICY IF EXISTS "staff_mission_members_delete_admin" ON staff_mission_members;
CREATE POLICY "staff_mission_members_delete_admin" ON staff_mission_members FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff_missions sm WHERE sm.id = staff_mission_members.mission_id AND sm.business_id = get_user_business_id()
      AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner', 'manager') OR is_superadmin = true))
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staff_missions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staff_mission_members TO authenticated;
GRANT ALL ON TABLE public.staff_missions TO service_role;
GRANT ALL ON TABLE public.staff_mission_members TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
