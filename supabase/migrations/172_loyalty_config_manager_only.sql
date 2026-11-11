-- ============================================================================
-- Migration 172 : Programme de fidélité — réglages modifiables par les managers
--
-- Bug : la politique "loyalty_config_all" (085_loyalty.sql) autorisait
-- lecture ET écriture à tout membre de l'établissement : un caissier pouvait
-- changer le taux de points ou la valeur d'un point depuis Paramètres.
--
-- Lecture : inchangée (tout membre — la caisse lit la configuration pour
-- calculer les points ; create_order la lit côté serveur).
-- Écriture : propriétaire, ou admin / manager de l'établissement — même règle
-- que la mise à jour de l'établissement (151_business_update_rls_fix.sql).
-- ============================================================================

DROP POLICY IF EXISTS "loyalty_config_all"    ON public.loyalty_config;
DROP POLICY IF EXISTS "loyalty_config_select" ON public.loyalty_config;
DROP POLICY IF EXISTS "loyalty_config_write"  ON public.loyalty_config;

CREATE POLICY "loyalty_config_select" ON public.loyalty_config FOR SELECT
  USING (business_id = get_user_business_id());

CREATE POLICY "loyalty_config_write" ON public.loyalty_config FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = loyalty_config.business_id AND b.owner_id = auth.uid())
    OR (
      business_id = get_user_business_id()
      AND EXISTS (SELECT 1 FROM public.users u
                  WHERE u.id = auth.uid() AND (u.role IN ('admin', 'manager', 'owner') OR u.is_superadmin = true))
    )
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = loyalty_config.business_id AND b.owner_id = auth.uid())
    OR (
      business_id = get_user_business_id()
      AND EXISTS (SELECT 1 FROM public.users u
                  WHERE u.id = auth.uid() AND (u.role IN ('admin', 'manager', 'owner') OR u.is_superadmin = true))
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.loyalty_config TO authenticated;
GRANT ALL ON TABLE public.loyalty_config TO service_role;
