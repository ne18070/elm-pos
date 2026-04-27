-- Migration 026 : Extension du suivi client pour les ordres de service
-- Ajoute service_order_id à client_tracking_tokens

ALTER TABLE public.client_tracking_tokens 
  ADD COLUMN IF NOT EXISTS service_order_id UUID REFERENCES public.service_orders(id) ON DELETE CASCADE;

-- Mettre à jour la politique de lecture pour inclure les service_orders
DROP POLICY IF EXISTS "public view tracking" ON client_tracking_tokens;
CREATE POLICY "public view tracking" ON client_tracking_tokens
  FOR SELECT USING (expires_at > now());
