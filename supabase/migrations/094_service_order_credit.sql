-- Paiement différé (crédit accordé) — l'OT reste "termine" mais le paiement est intentionnellement reporté
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS is_credit BOOLEAN NOT NULL DEFAULT FALSE;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.service_orders TO authenticated;
GRANT ALL ON TABLE public.service_orders TO service_role;
