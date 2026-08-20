-- Migration 098 : Lien paiement PayDunya <-> demandes d'abonnement publiques
-- Permet à la page /subscribe de faire payer un plan payant via PayDunya
-- SOFTPAY (Orange Money / Wave) au lieu du flow manuel (QR + reçu + validation
-- superadmin sous 24h). Le statut est mis à jour côté serveur uniquement (par
-- le webhook PayDunya, via le client service_role) — jamais par le client
-- anonyme, qui n'a que le droit INSERT sur cette table.

ALTER TABLE public.public_subscription_requests
  ADD COLUMN IF NOT EXISTS payment_status         text CHECK (payment_status IN ('paid')),
  ADD COLUMN IF NOT EXISTS paydunya_invoice_token  text,
  ADD COLUMN IF NOT EXISTS payment_confirmed_at    timestamptz;
