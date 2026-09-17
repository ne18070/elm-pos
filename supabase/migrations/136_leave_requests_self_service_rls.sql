-- ============================================================================
-- Migration 136 : Durcissement RLS sur leave_requests pour le self-service RH
--
-- Même classe de gap que la migration 135 (staff_payments), sur la table
-- voisine touchée par le même module self-service (/mon-espace-rh) : la
-- policy SELECT historique de leave_requests (012_leave_management.sql) ne
-- vérifie que l'appartenance business, pas que la demande de congé concerne
-- l'employé courant. Un compte 'staff' (rôle qui n'avait jamais eu de chemin
-- UI vers cette table avant migration 130-134) pouvait donc lire, via
-- getLeaveRequests avec un autre staff_id ou directement via l'API REST, les
-- demandes de congé de tous ses collègues (motif, admin_notes, dates).
--
-- 012_leave_management.sql est présumée déjà appliquée en production
-- (contrairement à 130-135, jamais exécutées) — on ne l'édite donc pas en
-- place, on pose une nouvelle policy par-dessus.
--
-- leave_types/pressure_days restent inchangées à dessein : ce sont des
-- catalogues (types de congés, jours de blackout) que chaque employé doit
-- voir intégralement pour soumettre sa propre demande — aucune donnée
-- personnelle n'y est exposée.
-- ============================================================================

DROP POLICY IF EXISTS "leave_requests_select" ON public.leave_requests;
CREATE POLICY "leave_requests_select" ON public.leave_requests FOR SELECT TO authenticated
  USING (
    business_id = get_user_business_id()
    AND (
      EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND (role IN ('admin', 'owner', 'manager') OR is_superadmin = true))
      OR EXISTS (SELECT 1 FROM public.staff s WHERE s.id = leave_requests.staff_id AND s.user_id = auth.uid())
    )
  );
