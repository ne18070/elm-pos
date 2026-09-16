-- ============================================================================
-- Migration 151 : Corrige business_update RLS — settings silencieusement
-- non enregistrés pour les rôles manager/admin
--
-- La policy UPDATE historique de `businesses` (001_core_and_auth.sql) ne
-- vérifiait que `owner_id = auth.uid()`. Or `manage_settings`
-- (renderer/lib/permissions.ts) autorise déjà manager/admin/owner à modifier
-- les paramètres de l'établissement (BusinessSettingsSection.tsx) — un compte
-- admin/manager qui change la devise (ou tout autre champ) voit l'UPDATE
-- réussir côté client (0 ligne affectée ne lève pas d'erreur avec
-- supabase-js), et l'état local se met à jour de manière optimiste, donnant
-- l'impression que ça a fonctionné — mais rien n'est persisté en base : au
-- prochain rechargement, la valeur d'origine (XOF par défaut) revient.
--
-- Même classe de bug que la policy UPDATE manquante sur leave_requests
-- (corrigée en 143).
-- ============================================================================

DROP POLICY IF EXISTS "business_update" ON businesses;
CREATE POLICY "business_update" ON businesses FOR UPDATE
  USING (
    owner_id = auth.uid()
    OR (
      id = get_user_business_id()
      AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'manager', 'owner') OR is_superadmin = true))
    )
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR (
      id = get_user_business_id()
      AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'manager', 'owner') OR is_superadmin = true))
    )
  );
