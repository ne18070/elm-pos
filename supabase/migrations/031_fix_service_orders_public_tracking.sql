-- Migration 031 : Autoriser l'accès public pour le suivi des ordres de service
-- Permet aux clients anonymes de voir leur propre commande via un token de suivi

-- 1. Autoriser la lecture des ordres de service via un token valide
DROP POLICY IF EXISTS "public_view_service_order_via_token" ON public.service_orders;
CREATE POLICY "public_view_service_order_via_token" ON public.service_orders
  FOR SELECT TO anon, authenticated
  USING (
    id IN (
      SELECT service_order_id 
      FROM public.client_tracking_tokens 
      WHERE expires_at > now()
    )
  );

-- 2. Autoriser la lecture des items de service via un token valide sur l'ordre parent
DROP POLICY IF EXISTS "public_view_service_order_items_via_token" ON public.service_order_items;
CREATE POLICY "public_view_service_order_items_via_token" ON public.service_order_items
  FOR SELECT TO anon, authenticated
  USING (
    order_id IN (
      SELECT service_order_id 
      FROM public.client_tracking_tokens 
      WHERE expires_at > now()
    )
  );

-- 3. S'assurer que les entreprises sont lisibles publiquement (déjà fait normalement, mais par sécurité)
DROP POLICY IF EXISTS "businesses_public_read_access" ON public.businesses;
CREATE POLICY "businesses_public_read_access" ON public.businesses
  FOR SELECT TO anon, authenticated
  USING (true);
