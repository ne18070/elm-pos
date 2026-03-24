-- ============================================================
-- Migration 021 : Module Revendeurs (Vendeurs Marché / Grossistes)
-- ============================================================

-- ─── 1. Prix de gros sur les produits ────────────────────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC(12,2);

-- ─── 2. Revendeurs ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resellers (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  phone       TEXT,
  email       TEXT,
  address     TEXT,
  notes       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 3. Clients des revendeurs ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reseller_clients (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reseller_id UUID NOT NULL REFERENCES resellers(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  phone       TEXT,
  address     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 4. Offres volume revendeurs ──────────────────────────────────────────────
-- Ex : pour 100 cartons achetés → 1 carton offert
CREATE TABLE IF NOT EXISTS reseller_offers (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  reseller_id  UUID REFERENCES resellers(id) ON DELETE CASCADE, -- NULL = tous les revendeurs
  product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  min_qty      NUMERIC(10,3) NOT NULL,   -- seuil déclencheur (ex: 100)
  bonus_qty    NUMERIC(10,3) NOT NULL DEFAULT 1, -- qté offerte (ex: 1)
  label        TEXT,                     -- ex: "1 carton offert pour 100 achetés"
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 5. Lien commandes ↔ revendeurs ─────────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type       TEXT NOT NULL DEFAULT 'retail';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reseller_id      UUID REFERENCES resellers(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reseller_client_id UUID REFERENCES reseller_clients(id) ON DELETE SET NULL;

-- ─── 6. Index ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_resellers_business      ON resellers(business_id);
CREATE INDEX IF NOT EXISTS idx_reseller_clients_biz    ON reseller_clients(business_id);
CREATE INDEX IF NOT EXISTS idx_reseller_clients_res    ON reseller_clients(reseller_id);
CREATE INDEX IF NOT EXISTS idx_reseller_offers_biz     ON reseller_offers(business_id);
CREATE INDEX IF NOT EXISTS idx_reseller_offers_res     ON reseller_offers(reseller_id);
CREATE INDEX IF NOT EXISTS idx_orders_reseller         ON orders(reseller_id);

-- ─── 7. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE resellers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE reseller_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE reseller_offers  ENABLE ROW LEVEL SECURITY;

-- Revendeurs
CREATE POLICY "resellers_business" ON resellers
  USING (business_id = get_user_business_id());
CREATE POLICY "resellers_insert" ON resellers FOR INSERT
  WITH CHECK (business_id = get_user_business_id());
CREATE POLICY "resellers_update" ON resellers FOR UPDATE
  USING (business_id = get_user_business_id());
CREATE POLICY "resellers_delete" ON resellers FOR DELETE
  USING (business_id = get_user_business_id());

-- Clients revendeurs
CREATE POLICY "reseller_clients_business" ON reseller_clients
  USING (business_id = get_user_business_id());
CREATE POLICY "reseller_clients_insert" ON reseller_clients FOR INSERT
  WITH CHECK (business_id = get_user_business_id());
CREATE POLICY "reseller_clients_update" ON reseller_clients FOR UPDATE
  USING (business_id = get_user_business_id());
CREATE POLICY "reseller_clients_delete" ON reseller_clients FOR DELETE
  USING (business_id = get_user_business_id());

-- Offres volume
CREATE POLICY "reseller_offers_business" ON reseller_offers
  USING (business_id = get_user_business_id());
CREATE POLICY "reseller_offers_insert" ON reseller_offers FOR INSERT
  WITH CHECK (business_id = get_user_business_id());
CREATE POLICY "reseller_offers_update" ON reseller_offers FOR UPDATE
  USING (business_id = get_user_business_id());
CREATE POLICY "reseller_offers_delete" ON reseller_offers FOR DELETE
  USING (business_id = get_user_business_id());
