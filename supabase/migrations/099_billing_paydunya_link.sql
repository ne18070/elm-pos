-- Migration 099 : Lien paiement PayDunya <-> demandes de renouvellement (billing)
-- Même principe que la migration 098, mais pour subscription_requests (clients
-- déjà inscrits qui renouvellent/changent de plan depuis /billing), plutôt que
-- public_subscription_requests (nouveaux prospects sur /subscribe).

ALTER TABLE public.subscription_requests
  ADD COLUMN IF NOT EXISTS payment_status         text CHECK (payment_status IN ('paid')),
  ADD COLUMN IF NOT EXISTS paydunya_invoice_token  text,
  ADD COLUMN IF NOT EXISTS payment_confirmed_at    timestamptz;
