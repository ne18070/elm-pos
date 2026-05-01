-- ============================================================
-- Historique des versements par OT (acomptes + soldes)
-- ============================================================

CREATE TABLE IF NOT EXISTS service_order_payments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  business_id UUID NOT NULL,
  amount      NUMERIC(10,2) NOT NULL,
  method      TEXT NOT NULL DEFAULT 'cash',
  paid_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sop_order    ON service_order_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_sop_business ON service_order_payments(business_id);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE service_order_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_order_payments_member" ON service_order_payments;

CREATE POLICY "service_order_payments_member" ON service_order_payments
  FOR ALL TO authenticated
  USING  (order_id IN (SELECT id FROM service_orders WHERE business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid())))
  WITH CHECK (order_id IN (SELECT id FROM service_orders WHERE business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid())));
