-- Migration 109 : RLS orders_select respecte la permission « view_all_orders »
--
-- Jusqu'ici, la policy SELECT sur `orders` limitait tout le monde à ses propres
-- ventes (cashier_id = auth.uid()) SAUF les rôles admin/owner. Résultat : activer
-- la permission applicative « Voir toutes les factures » pour un caissier (ou la
-- laisser par défaut pour un manager) n'avait AUCUN effet — la base masquait
-- toujours les lignes des autres caissiers, quel que soit le filtre du front.
--
-- On aligne la base sur le modèle de permissions applicatif :
--   effective(view_all_orders) =
--     override explicite dans member_permission_overrides s'il existe,
--     sinon rôle ∈ (manager, admin, owner)   [= defaultRoles côté TS]
--
-- La policy autorise donc la lecture de TOUTES les commandes du business dès que
-- can_view_all_orders() est vrai ; sinon on retombe sur « ses propres ventes ».

CREATE OR REPLACE FUNCTION public.can_view_all_orders()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT granted
       FROM member_permission_overrides
      WHERE business_id = get_user_business_id()
        AND user_id     = auth.uid()
        AND permission  = 'view_all_orders'),
    COALESCE(get_user_role() IN ('manager', 'admin', 'owner'), false)
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_view_all_orders() TO authenticated, service_role;

DROP POLICY IF EXISTS "orders_select" ON public.orders;
CREATE POLICY "orders_select" ON public.orders FOR SELECT
  USING (
    business_id = get_user_business_id()
    AND (
      cashier_id = auth.uid()
      OR public.can_view_all_orders()
    )
  );
