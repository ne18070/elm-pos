-- ============================================================================
-- Migration 135 : Durcissement RLS sur staff_payments pour le self-service RH
--
-- Le module RH self-service (/mon-espace-rh, migrations 130-134) rend
-- accessible la clé de permission view_my_hr à TOUS les rôles, y compris
-- 'staff' — jusqu'ici ce rôle n'avait jamais eu de chemin UI vers
-- staff_payments. Or la policy SELECT historique de staff_payments
-- (007_specialized_modules.sql) ne vérifie que l'appartenance business, pas
-- que le bulletin concerne l'employé courant : un compte 'staff' pouvait
-- lire (getPayments avec un autre staff_id, ou directement via l'API REST)
-- les bulletins de paie de tous ses collègues (net_amount, primes,
-- retenues, cotisations).
--
-- Cette migration restreint la lecture aux admin/owner/manager (accès
-- gestion complet, inchangé) et, pour tout autre rôle, à la fiche staff
-- liée à son propre compte (staff.user_id = auth.uid()) — même mécanisme
-- de self-scope que staff_documents/staff_checklist_items/staff_schedules
-- (130-131) et staff_payment_lines (132, corrigé en même temps que ce
-- fichier).
--
-- INSERT/UPDATE/DELETE sont également resserrés à admin/owner : ces
-- policies dataient de 007 (accès business-wide, avant qu'aucun rôle
-- 'staff' n'ait de chemin UI vers ce module) alors que l'unique point
-- d'écriture actuel (createPayment, dans PaymentModal.tsx) est déjà gated
-- côté UI par manage_staff_payroll = admin/owner uniquement — aucune
-- fonctionnalité existante ne dépend d'un accès manager/staff en écriture
-- (markPaymentPaid/deletePayment ne sont appelées nulle part dans le
-- renderer).
-- ============================================================================

DROP POLICY IF EXISTS "staff_payments: members can read" ON staff_payments;
CREATE POLICY "staff_payments: members can read"
  ON staff_payments FOR SELECT
  USING (
    business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid())
    AND (
      EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner', 'manager') OR is_superadmin = true))
      OR EXISTS (SELECT 1 FROM staff s WHERE s.id = staff_payments.staff_id AND s.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "staff_payments: members can insert" ON staff_payments;
CREATE POLICY "staff_payments: members can insert"
  ON staff_payments FOR INSERT
  WITH CHECK (
    business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner') OR is_superadmin = true))
  );

DROP POLICY IF EXISTS "staff_payments: members can update" ON staff_payments;
CREATE POLICY "staff_payments: members can update"
  ON staff_payments FOR UPDATE
  USING (
    business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner') OR is_superadmin = true))
  );

DROP POLICY IF EXISTS "staff_payments: members can delete" ON staff_payments;
CREATE POLICY "staff_payments: members can delete"
  ON staff_payments FOR DELETE
  USING (
    business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner') OR is_superadmin = true))
  );
