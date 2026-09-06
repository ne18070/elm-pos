-- Migration 111 : RLS coupons_manage — aligner sur la permission « manage_coupons »
--
-- La permission applicative `manage_coupons` a pour rôles par défaut
-- (manager, admin, owner), et l'UI (page Coupons & Remises : boutons Nouveau /
-- Modifier / Supprimer) est gardée par `can('manage_coupons')`. Mais la RLS
-- n'autorisait l'écriture qu'aux rôles (admin, owner) → un manager voyait les
-- boutons mais toute création / modification / suppression échouait en base.
--
-- On aligne la policy sur les rôles de la permission.

DROP POLICY IF EXISTS "coupons_manage" ON public.coupons;
CREATE POLICY "coupons_manage" ON public.coupons FOR ALL
  USING (
    business_id = get_user_business_id()
    AND get_user_role() IN ('manager', 'admin', 'owner')
  )
  WITH CHECK (
    business_id = get_user_business_id()
    AND get_user_role() IN ('manager', 'admin', 'owner')
  );
