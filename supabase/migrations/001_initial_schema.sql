-- ============================================================
-- Elm POS — Schéma initial Supabase
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Établissements ───────────────────────────────────────────────────────────

CREATE TABLE businesses (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('restaurant','retail','service','hotel')),
  address         TEXT,
  phone           TEXT,
  email           TEXT,
  logo_url        TEXT,
  currency        TEXT NOT NULL DEFAULT 'XOF',
  tax_rate        NUMERIC(5,2) NOT NULL DEFAULT 0,
  receipt_footer  TEXT,
  owner_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Profils utilisateurs ─────────────────────────────────────────────────────

CREATE TABLE users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  full_name   TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','owner','staff')),
  business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Déclencher à la création d'un compte auth
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO users (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'staff')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── Catégories ───────────────────────────────────────────────────────────────

CREATE TABLE categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       TEXT,
  icon        TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(business_id, name)
);

-- ─── Produits ─────────────────────────────────────────────────────────────────

CREATE TABLE products (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  description TEXT,
  price       NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  image_url   TEXT,
  barcode     TEXT,
  sku         TEXT,
  track_stock BOOLEAN NOT NULL DEFAULT false,
  stock       INTEGER,
  variants    JSONB NOT NULL DEFAULT '[]',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_products_business ON products(business_id) WHERE is_active;
CREATE INDEX idx_products_barcode  ON products(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX idx_products_category ON products(category_id);

-- Décrémenter le stock de façon atomique
CREATE OR REPLACE FUNCTION decrement_stock(p_product_id UUID, p_quantity INTEGER)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE products
  SET stock = GREATEST(0, stock - p_quantity),
      updated_at = NOW()
  WHERE id = p_product_id AND track_stock = true;
END;
$$;

-- ─── Coupons ──────────────────────────────────────────────────────────────────

CREATE TABLE coupons (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id      UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  code             TEXT NOT NULL,
  type             TEXT NOT NULL CHECK (type IN ('percentage','fixed')),
  value            NUMERIC(12,2) NOT NULL CHECK (value > 0),
  min_order_amount NUMERIC(12,2),
  max_uses         INTEGER,
  uses_count       INTEGER NOT NULL DEFAULT 0,
  per_user_limit   INTEGER,
  expires_at       TIMESTAMPTZ,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(business_id, code)
);

CREATE INDEX idx_coupons_code ON coupons(business_id, code);

-- ─── Commandes ────────────────────────────────────────────────────────────────

CREATE TABLE orders (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  cashier_id      UUID NOT NULL REFERENCES users(id),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled','refunded')),
  subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total           NUMERIC(12,2) NOT NULL DEFAULT 0,
  coupon_id       UUID REFERENCES coupons(id) ON DELETE SET NULL,
  coupon_code     TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_business    ON orders(business_id, created_at DESC);
CREATE INDEX idx_orders_cashier     ON orders(cashier_id);
CREATE INDEX idx_orders_status      ON orders(business_id, status);
CREATE INDEX idx_orders_date_status ON orders(business_id, status, created_at);

-- ─── Articles de commande ─────────────────────────────────────────────────────

CREATE TABLE order_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id),
  variant_id      TEXT,
  name            TEXT NOT NULL,   -- snapshot
  price           NUMERIC(12,2) NOT NULL,
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total           NUMERIC(12,2) NOT NULL,
  notes           TEXT
);

CREATE INDEX idx_order_items_order   ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);

-- ─── Paiements ────────────────────────────────────────────────────────────────

CREATE TABLE payments (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id  UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method    TEXT NOT NULL CHECK (method IN ('cash','card','mobile_money','partial')),
  amount    NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  reference TEXT,
  paid_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_order ON payments(order_id);

-- ─── Sécurité (RLS) ───────────────────────────────────────────────────────────

ALTER TABLE businesses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE products    ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons     ENABLE ROW LEVEL SECURITY;

-- Fonction utilitaire : récupère le business_id de l'utilisateur courant
CREATE OR REPLACE FUNCTION get_user_business_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT business_id FROM users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM users WHERE id = auth.uid();
$$;

-- businesses : lecture par les membres du business, écriture par le propriétaire
CREATE POLICY "business_select" ON businesses FOR SELECT
  USING (id = get_user_business_id() OR owner_id = auth.uid());

CREATE POLICY "business_update" ON businesses FOR UPDATE
  USING (owner_id = auth.uid());

-- users : chaque utilisateur voit les membres de son business
CREATE POLICY "users_select" ON users FOR SELECT
  USING (business_id = get_user_business_id() OR id = auth.uid());

CREATE POLICY "users_update_self" ON users FOR UPDATE
  USING (id = auth.uid());

-- categories, products : lecture par tous les membres du business
CREATE POLICY "categories_select" ON categories FOR SELECT
  USING (business_id = get_user_business_id());

CREATE POLICY "categories_manage" ON categories FOR ALL
  USING (business_id = get_user_business_id()
         AND get_user_role() IN ('admin','owner'));

CREATE POLICY "products_select" ON products FOR SELECT
  USING (business_id = get_user_business_id());

CREATE POLICY "products_manage" ON products FOR ALL
  USING (business_id = get_user_business_id()
         AND get_user_role() IN ('admin','owner'));

-- orders : lecture par caissier (ses propres commandes) ou admin/owner
CREATE POLICY "orders_select" ON orders FOR SELECT
  USING (business_id = get_user_business_id()
         AND (cashier_id = auth.uid() OR get_user_role() IN ('admin','owner')));

CREATE POLICY "orders_insert" ON orders FOR INSERT
  WITH CHECK (business_id = get_user_business_id());

CREATE POLICY "orders_update" ON orders FOR UPDATE
  USING (business_id = get_user_business_id()
         AND get_user_role() IN ('admin','owner'));

-- order_items & payments : via l'order_id
CREATE POLICY "order_items_select" ON order_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_items.order_id
      AND o.business_id = get_user_business_id()
  ));

CREATE POLICY "payments_select" ON payments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = payments.order_id
      AND o.business_id = get_user_business_id()
  ));

-- coupons : lecture par tous, gestion par admin/owner
CREATE POLICY "coupons_select" ON coupons FOR SELECT
  USING (business_id = get_user_business_id());

CREATE POLICY "coupons_manage" ON coupons FOR ALL
  USING (business_id = get_user_business_id()
         AND get_user_role() IN ('admin','owner'));
