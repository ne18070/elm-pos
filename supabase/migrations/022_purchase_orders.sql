-- Purchase orders (bons de commande)
CREATE TABLE IF NOT EXISTS purchase_orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  supplier_id   UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT,
  reference     TEXT,
  status        TEXT NOT NULL DEFAULT 'draft'
                  CONSTRAINT chk_po_status CHECK (status IN ('draft','ordered','received','cancelled')),
  notes         TEXT,
  ordered_at    TIMESTAMPTZ,
  received_at   TIMESTAMPTZ,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_po_business ON purchase_orders(business_id);
CREATE INDEX IF NOT EXISTS idx_po_status   ON purchase_orders(status);

-- Items per purchase order
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id       UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity_ordered NUMERIC NOT NULL DEFAULT 0,
  quantity_received NUMERIC,
  cost_per_unit    NUMERIC,
  packaging_qty    INTEGER,
  packaging_size   NUMERIC,
  packaging_unit   TEXT
);
CREATE INDEX IF NOT EXISTS idx_poi_order ON purchase_order_items(order_id);
