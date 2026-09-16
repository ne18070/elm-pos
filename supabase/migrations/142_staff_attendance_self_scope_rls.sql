-- ============================================================================
-- Migration 142 : Durcissement RLS sur staff_attendance (lecture uniquement)
--
-- La policy SELECT historique de staff_attendance (007_specialized_modules.sql)
-- ne vérifie que l'appartenance business, pas que la présence concerne
-- l'employé courant : un compte 'staff' pouvait lire les présences de tous
-- ses collègues via getAttendanceForMonth ou directement l'API REST. Même
-- classe de gap que 135 (staff_payments) et 136 (leave_requests).
--
-- INSERT/UPDATE/DELETE restent volontairement inchangés (business-wide) :
-- recordBadgeClock() (services/supabase/staff.ts) et l'écran /staff/pointage
-- écrivent une présence pour N'IMPORTE QUEL employé scanné au badge, sans
-- permission dédiée — un compte 'staff' opérant le kiosque pour un collègue
-- doit pouvoir écrire sa ligne. Durcir l'écriture casserait ce flux.
-- ============================================================================

DROP POLICY IF EXISTS "attendance: members can read" ON staff_attendance;
CREATE POLICY "attendance: members can read"
  ON staff_attendance FOR SELECT
  USING (
    business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid())
    AND (
      EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner', 'manager') OR is_superadmin = true))
      OR EXISTS (SELECT 1 FROM staff s WHERE s.id = staff_attendance.staff_id AND s.user_id = auth.uid())
    )
  );
