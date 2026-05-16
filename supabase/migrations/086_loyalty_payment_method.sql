-- Migration 086 : Ajouter 'loyalty' comme méthode de paiement valide

-- Table payments (POS retail — migration 003)
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_method_check
  CHECK (method IN ('cash', 'card', 'mobile_money', 'partial', 'loyalty'));

-- service_order_payments n'a pas de CHECK sur method (TEXT libre) — rien à faire
