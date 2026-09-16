-- ============================================================================
-- Migration 143 : Complétude RLS sur leave_requests
--
-- 012_leave_management.sql n'a jamais créé de policy UPDATE sur
-- leave_requests. RLS activé + aucune policy UPDATE = le rôle `authenticated`
-- ne peut modifier aucune ligne. updateLeaveRequestStatus() (appelé par le
-- bouton Approuver/Rejeter de staff/LeaveManagementContent.tsx) échoue donc
-- silencieusement depuis toujours : Supabase-js ne lève pas d'erreur sur un
-- UPDATE qui matche 0 ligne, donc l'admin voit son clic "réussir" sans que
-- le statut change réellement en base.
--
-- Cette migration ajoute la policy UPDATE manquante (admin/owner/manager,
-- même périmètre que les autres tables RH — 130/131/135/136) et resserre
-- l'INSERT existant : la policy d'origine vérifiait seulement que le
-- staff_id référencé appartient à l'appelant, sans jamais vérifier que le
-- business_id du payload correspond au business de ce staff — un payload
-- pouvait donc attribuer la demande à un business_id arbitraire.
-- ============================================================================

DROP POLICY IF EXISTS "leave_requests_insert_self" ON public.leave_requests;
CREATE POLICY "leave_requests_insert_self" ON public.leave_requests FOR INSERT TO authenticated
  WITH CHECK (
    business_id = get_user_business_id()
    AND EXISTS (
      SELECT 1 FROM public.staff s WHERE s.id = staff_id AND s.business_id = get_user_business_id()
        AND (s.user_id = auth.uid() OR (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'owner'))
    )
  );

DROP POLICY IF EXISTS "leave_requests_update_admin" ON public.leave_requests;
CREATE POLICY "leave_requests_update_admin" ON public.leave_requests FOR UPDATE TO authenticated
  USING (
    business_id = get_user_business_id()
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND (role IN ('admin', 'owner', 'manager') OR is_superadmin = true))
  )
  WITH CHECK (
    business_id = get_user_business_id()
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND (role IN ('admin', 'owner', 'manager') OR is_superadmin = true))
  );
