-- ============================================================================
-- Migration 149 : Corrige la récursion infinie RLS sur staff_mission_members
--
-- Cause (148) : "staff_missions_select" référence staff_mission_members pour
-- vérifier l'appartenance, et "staff_mission_members_select" référence en
-- retour staff_missions pour vérifier business/demandeur — chaque table
-- déclenche la policy SELECT de l'autre, qui déclenche à nouveau celle de la
-- première, etc. → "infinite recursion detected in policy".
--
-- Correction : staff_mission_members_select lit désormais staff_missions via
-- une fonction SECURITY DEFINER (même pattern que get_user_business_id /
-- get_user_role, migration 002), qui s'exécute sans repasser par la RLS de
-- staff_missions — casse la boucle sans changer le périmètre d'accès (même
-- prédicat qu'avant : admin/owner/manager, ou demandeur de la mission).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.staff_mission_visible_to_caller(p_mission_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM staff_missions sm
    WHERE sm.id = p_mission_id
      AND sm.business_id = get_user_business_id()
      AND (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner', 'manager') OR is_superadmin = true))
        OR EXISTS (SELECT 1 FROM staff s WHERE s.id = sm.requested_by AND s.user_id = auth.uid())
      )
  );
$$;

DROP POLICY IF EXISTS "staff_mission_members_select" ON staff_mission_members;
CREATE POLICY "staff_mission_members_select" ON staff_mission_members FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM staff s WHERE s.id = staff_mission_members.staff_id AND s.user_id = auth.uid())
    OR staff_mission_visible_to_caller(staff_mission_members.mission_id)
  );

GRANT EXECUTE ON FUNCTION public.staff_mission_visible_to_caller(UUID) TO authenticated, service_role;
