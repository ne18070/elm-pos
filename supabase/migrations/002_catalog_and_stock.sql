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


ALTER TABLE categories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE products    ENABLE ROW LEVEL SECURITY;

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

CREATE POLICY "coupons_select" ON coupons FOR SELECT
  USING (business_id = get_user_business_id());

CREATE POLICY "coupons_manage" ON coupons FOR ALL
  USING (business_id = get_user_business_id()
         AND get_user_role() IN ('admin','owner'));


-- ============================================================
-- Fonctions PostgreSQL utilisées par les Edge Functions
-- ============================================================

-- Incrémenter le compteur d'utilisation d'un coupon
CREATE OR REPLACE FUNCTION increment_coupon_uses(p_coupon_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE coupons
  SET uses_count = uses_count + 1
  WHERE id = p_coupon_id;
END;
$$;


-- Créer une commande complète en transaction (version SQL, pour les appels RPC directs)
CREATE OR REPLACE FUNCTION create_order(order_data JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order_id UUID;
  v_order    JSONB;
  v_item     JSONB;
BEGIN
  -- Insérer la commande
  INSERT INTO orders (
    business_id, cashier_id, status,
    subtotal, tax_amount, discount_amount, total,
    coupon_id, coupon_code, notes
  )
  VALUES (
    (order_data->>'business_id')::UUID,
    (order_data->>'cashier_id')::UUID,
    'paid',
    (order_data->>'subtotal')::NUMERIC,
    (order_data->>'tax_amount')::NUMERIC,
    (order_data->>'discount_amount')::NUMERIC,
    (order_data->>'total')::NUMERIC,
    (order_data->>'coupon_id')::UUID,
    order_data->>'coupon_code',
    order_data->>'notes'
  )
  RETURNING id INTO v_order_id;

  -- Insérer les articles
  FOR v_item IN SELECT * FROM jsonb_array_elements(order_data->'items')
  LOOP
    INSERT INTO order_items (
      order_id, product_id, variant_id, name,
      price, quantity, discount_amount, total, notes
    )
    VALUES (
      v_order_id,
      (v_item->>'product_id')::UUID,
      v_item->>'variant_id',
      v_item->>'name',
      (v_item->>'price')::NUMERIC,
      (v_item->>'quantity')::INTEGER,
      COALESCE((v_item->>'discount_amount')::NUMERIC, 0),
      (v_item->>'total')::NUMERIC,
      v_item->>'notes'
    );

    -- Décrémenter le stock
    PERFORM decrement_stock(
      (v_item->>'product_id')::UUID,
      (v_item->>'quantity')::INTEGER
    );
  END LOOP;

  -- Insérer le paiement
  INSERT INTO payments (order_id, method, amount, reference)
  VALUES (
    v_order_id,
    (order_data->'payment'->>'method'),
    (order_data->'payment'->>'amount')::NUMERIC,
    order_data->'payment'->>'reference'
  );

  -- Incrémenter le coupon
  IF order_data->>'coupon_id' IS NOT NULL THEN
    PERFORM increment_coupon_uses((order_data->>'coupon_id')::UUID);
  END IF;

  -- Retourner la commande complète
  SELECT to_jsonb(o.*) INTO v_order
  FROM orders o WHERE o.id = v_order_id;

  RETURN v_order;
END;
$$;


-- Valider un coupon (version SQL)
CREATE OR REPLACE FUNCTION validate_coupon(
  coupon_code TEXT,
  business_id UUID,
  order_total NUMERIC,
  user_id     UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_coupon coupons%ROWTYPE;
  v_count  INTEGER;
BEGIN
  SELECT * INTO v_coupon
  FROM coupons c
  WHERE c.business_id = validate_coupon.business_id
    AND c.code = UPPER(TRIM(coupon_code));

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Coupon introuvable');
  END IF;

  IF NOT v_coupon.is_active THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Ce coupon est désactivé');
  END IF;

  IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < NOW() THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Ce coupon a expiré');
  END IF;

  IF v_coupon.max_uses IS NOT NULL AND v_coupon.uses_count >= v_coupon.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Limite d''utilisation atteinte');
  END IF;

  IF v_coupon.min_order_amount IS NOT NULL AND order_total < v_coupon.min_order_amount THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'Montant minimum non atteint : ' || v_coupon.min_order_amount
    );
  END IF;

  IF v_coupon.per_user_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count
    FROM orders
    WHERE cashier_id = user_id
      AND coupon_id = v_coupon.id
      AND status = 'paid';

    IF v_count >= v_coupon.per_user_limit THEN
      RETURN jsonb_build_object('valid', false, 'error', 'Déjà utilisé par cet utilisateur');
    END IF;
  END IF;

  RETURN jsonb_build_object('valid', true, 'coupon', to_jsonb(v_coupon));
END;
$$;

-- File: 003_storage.sql
-- ─── Bucket Supabase Storage pour les images produits ────────────────────────
-- À exécuter dans : Supabase Dashboard > SQL Editor

-- Créer le bucket public "product-images"
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- Politique : lecture publique (les images s'affichent sans auth)
CREATE POLICY "Lecture publique product-images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

-- Politique : upload uniquement pour les utilisateurs authentifiés du bon business
CREATE POLICY "Upload product-images authentifié"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'product-images'
    AND auth.role() = 'authenticated'
  );

-- Politique : suppression réservée au propriétaire du fichier
CREATE POLICY "Suppression product-images propriétaire"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'product-images'
    AND auth.uid() = owner
  );


-- File: 009_unit_stock_consumption.sql
-- ============================================================
-- Migration 009 : Unité de mesure + stock_consumption
-- ============================================================

-- 1. Passer products.stock de INTEGER à NUMERIC(10,3)
ALTER TABLE products ALTER COLUMN stock TYPE NUMERIC(10,3);

-- 2. Ajouter la colonne unit sur products
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'pièce';

-- 3. stock_consumption est stocké dans le JSONB products.variants
--    (pas de table product_variants séparée) — aucune migration DB nécessaire

-- 4. Recréer decrement_stock pour accepter NUMERIC
CREATE OR REPLACE FUNCTION decrement_stock(p_product_id UUID, p_quantity NUMERIC)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE products
  SET stock = GREATEST(0, stock - p_quantity),
      updated_at = NOW()
  WHERE id = p_product_id AND track_stock = true;
END;
$$;

-- 5. Recréer create_order pour utiliser stock_consumption depuis les items
CREATE OR REPLACE FUNCTION create_order(order_data JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order_id   UUID;
  v_order      JSONB;
  v_item       JSONB;
  v_payment    JSONB;
  v_status     TEXT;
  v_pay_method TEXT;
BEGIN
  -- Déterminer le statut : 'pending' si acompte, 'paid' sinon
  v_pay_method := order_data->'payment'->>'method';
  IF v_pay_method = 'partial' THEN
    v_status := 'pending';
  ELSE
    v_status := 'paid';
  END IF;

  -- Insérer la commande
  INSERT INTO orders (
    business_id, cashier_id, status,
    subtotal, tax_amount, discount_amount, total,
    coupon_id, coupon_code, notes,
    customer_name, customer_phone
  )
  VALUES (
    (order_data->>'business_id')::UUID,
    (order_data->>'cashier_id')::UUID,
    v_status,
    (order_data->>'subtotal')::NUMERIC,
    (order_data->>'tax_amount')::NUMERIC,
    (order_data->>'discount_amount')::NUMERIC,
    (order_data->>'total')::NUMERIC,
    NULLIF(order_data->>'coupon_id', '')::UUID,
    order_data->>'coupon_code',
    order_data->>'notes',
    order_data->>'customer_name',
    order_data->>'customer_phone'
  )
  RETURNING id INTO v_order_id;

  -- Insérer les articles + décrémenter le stock avec stock_consumption
  FOR v_item IN SELECT * FROM jsonb_array_elements(order_data->'items')
  LOOP
    INSERT INTO order_items (
      order_id, product_id, variant_id, name,
      price, quantity, discount_amount, total, notes
    )
    VALUES (
      v_order_id,
      (v_item->>'product_id')::UUID,
      NULLIF(v_item->>'variant_id', '')::UUID,
      v_item->>'name',
      (v_item->>'price')::NUMERIC,
      (v_item->>'quantity')::INTEGER,
      COALESCE((v_item->>'discount_amount')::NUMERIC, 0),
      (v_item->>'total')::NUMERIC,
      v_item->>'notes'
    );

    PERFORM decrement_stock(
      (v_item->>'product_id')::UUID,
      (v_item->>'quantity')::NUMERIC * COALESCE((v_item->>'stock_consumption')::NUMERIC, 1)
    );
  END LOOP;

  -- Insérer les paiements
  -- Priorité : tableau payments[] s'il est fourni et non vide
  IF jsonb_array_length(COALESCE(order_data->'payments', '[]'::JSONB)) > 0 THEN
    FOR v_payment IN SELECT * FROM jsonb_array_elements(order_data->'payments')
    LOOP
      INSERT INTO payments (order_id, method, amount)
      VALUES (
        v_order_id,
        v_payment->>'method',
        (v_payment->>'amount')::NUMERIC
      );
    END LOOP;
  ELSE
    -- Fallback : paiement unique via order_data.payment
    INSERT INTO payments (order_id, method, amount, reference)
    VALUES (
      v_order_id,
      v_pay_method,
      (order_data->'payment'->>'amount')::NUMERIC,
      order_data->'payment'->>'reference'
    );
  END IF;

  -- Incrémenter le compteur du coupon
  IF order_data->>'coupon_id' IS NOT NULL AND order_data->>'coupon_id' <> '' THEN
    PERFORM increment_coupon_uses((order_data->>'coupon_id')::UUID);
  END IF;

  -- Retourner la commande complète
  SELECT to_jsonb(o.*) INTO v_order
  FROM orders o WHERE o.id = v_order_id;

  RETURN v_order;
END;
$$;


-- File: 010_stock_entries.sql
-- ============================================================
-- Migration 010 : Module Approvisionnement
-- ============================================================

CREATE TABLE IF NOT EXISTS stock_entries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  -- Quantité en unités de base ajoutée au stock (ex: 1000 pour 1000 kg)
  quantity        NUMERIC(10,3) NOT NULL CHECK (quantity > 0),
  -- Détail du conditionnement (ex: 20 sacs × 50 kg)
  packaging_qty   INTEGER,
  packaging_size  NUMERIC(10,3),
  packaging_unit  TEXT,               -- ex: "sac", "carton", "colis"
  -- Infos achat
  supplier        TEXT,
  cost_per_unit   NUMERIC(12,2),      -- coût par unité de base
  notes           TEXT,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_entries_business  ON stock_entries(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_entries_product   ON stock_entries(product_id);

ALTER TABLE stock_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_entries_select" ON stock_entries FOR SELECT
  USING (business_id = get_user_business_id());

CREATE POLICY "stock_entries_insert" ON stock_entries FOR INSERT
  WITH CHECK (
    business_id = get_user_business_id()
    AND get_user_role() IN ('owner', 'admin')
  );

-- ─── RPC : enregistrer un approvisionnement (atomique) ───────────────────────

CREATE OR REPLACE FUNCTION add_stock_entry(
  p_business_id   UUID,
  p_product_id    UUID,
  p_quantity      NUMERIC,
  p_packaging_qty  INTEGER  DEFAULT NULL,
  p_packaging_size NUMERIC  DEFAULT NULL,
  p_packaging_unit TEXT     DEFAULT NULL,
  p_supplier      TEXT     DEFAULT NULL,
  p_cost_per_unit NUMERIC  DEFAULT NULL,
  p_notes         TEXT     DEFAULT NULL,
  p_created_by    UUID     DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  -- Vérifier que le produit appartient bien au business
  IF NOT EXISTS (
    SELECT 1 FROM products WHERE id = p_product_id AND business_id = p_business_id
  ) THEN
    RAISE EXCEPTION 'Produit introuvable';
  END IF;

  -- Enregistrer l'entrée de stock
  INSERT INTO stock_entries (
    business_id, product_id, quantity,
    packaging_qty, packaging_size, packaging_unit,
    supplier, cost_per_unit, notes, created_by
  )
  VALUES (
    p_business_id, p_product_id, p_quantity,
    p_packaging_qty, p_packaging_size, p_packaging_unit,
    p_supplier, p_cost_per_unit, p_notes, p_created_by
  );

  -- Incrémenter le stock du produit
  UPDATE products
  SET stock      = COALESCE(stock, 0) + p_quantity,
      updated_at = NOW()
  WHERE id = p_product_id;
END;
$$;


-- File: 011_business_stock_units.sql
-- ============================================================
-- Migration 011 : Unités de stock configurables par business
-- ============================================================

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS stock_units JSONB NOT NULL
  DEFAULT '["pièce","kg","g","litre","cl","carton","sac","sachet","boîte","paquet","lot"]';


-- File: 012_coupon_free_item.sql
-- ============================================================
-- Migration 012 : Coupon type "article offert" (free_item)
-- ============================================================

-- 1. Supprimer les anciennes contraintes
ALTER TABLE coupons DROP CONSTRAINT IF EXISTS coupons_type_check;
ALTER TABLE coupons DROP CONSTRAINT IF EXISTS coupons_value_check;

-- 2. Ajouter les nouveaux champs
ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS min_quantity     INTEGER,   -- qté minimum de produits dans le panier
  ADD COLUMN IF NOT EXISTS free_item_label  TEXT;      -- description de l'article offert (ex: "1 bouteille")

-- 3. Recréer les contraintes avec le nouveau type
ALTER TABLE coupons
  ADD CONSTRAINT coupons_type_check
    CHECK (type IN ('percentage', 'fixed', 'free_item'));

-- Pour free_item : value = 0 est autorisé (pas de remise monétaire)
ALTER TABLE coupons
  ADD CONSTRAINT coupons_value_check
    CHECK (
      (type IN ('percentage', 'fixed') AND value > 0)
      OR
      (type = 'free_item' AND value >= 0)
    );


-- File: 013_coupon_notes.sql
-- ============================================================
-- Migration 013 : coupon_notes sur orders
-- Stocke la description du coupon (ex: "1 bouteille offerte")
-- pour affichage sur factures et reçus imprimés.
-- ============================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS coupon_notes TEXT;

-- Réécrire create_order pour inclure coupon_notes
CREATE OR REPLACE FUNCTION create_order(order_data JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order_id   UUID;
  v_order      JSONB;
  v_item       JSONB;
  v_payment    JSONB;
  v_status     TEXT;
  v_pay_method TEXT;
BEGIN
  v_pay_method := order_data->'payment'->>'method';
  IF v_pay_method = 'partial' THEN
    v_status := 'pending';
  ELSE
    v_status := 'paid';
  END IF;

  INSERT INTO orders (
    business_id, cashier_id, status,
    subtotal, tax_amount, discount_amount, total,
    coupon_id, coupon_code, coupon_notes, notes,
    customer_name, customer_phone
  )
  VALUES (
    (order_data->>'business_id')::UUID,
    (order_data->>'cashier_id')::UUID,
    v_status,
    (order_data->>'subtotal')::NUMERIC,
    (order_data->>'tax_amount')::NUMERIC,
    (order_data->>'discount_amount')::NUMERIC,
    (order_data->>'total')::NUMERIC,
    NULLIF(order_data->>'coupon_id', '')::UUID,
    order_data->>'coupon_code',
    order_data->>'coupon_notes',
    order_data->>'notes',
    order_data->>'customer_name',
    order_data->>'customer_phone'
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(order_data->'items')
  LOOP
    INSERT INTO order_items (
      order_id, product_id, variant_id, name,
      price, quantity, discount_amount, total, notes
    )
    VALUES (
      v_order_id,
      (v_item->>'product_id')::UUID,
      NULLIF(v_item->>'variant_id', '')::UUID,
      v_item->>'name',
      (v_item->>'price')::NUMERIC,
      (v_item->>'quantity')::INTEGER,
      COALESCE((v_item->>'discount_amount')::NUMERIC, 0),
      (v_item->>'total')::NUMERIC,
      v_item->>'notes'
    );

    PERFORM decrement_stock(
      (v_item->>'product_id')::UUID,
      (v_item->>'quantity')::INTEGER
    );
  END LOOP;

  IF jsonb_array_length(COALESCE(order_data->'payments', '[]'::JSONB)) > 0 THEN
    FOR v_payment IN SELECT * FROM jsonb_array_elements(order_data->'payments')
    LOOP
      INSERT INTO payments (order_id, method, amount)
      VALUES (
        v_order_id,
        v_payment->>'method',
        (v_payment->>'amount')::NUMERIC
      );
    END LOOP;
  ELSE
    INSERT INTO payments (order_id, method, amount, reference)
    VALUES (
      v_order_id,
      v_pay_method,
      (order_data->'payment'->>'amount')::NUMERIC,
      order_data->'payment'->>'reference'
    );
  END IF;

  IF order_data->>'coupon_id' IS NOT NULL AND order_data->>'coupon_id' <> '' THEN
    PERFORM increment_coupon_uses((order_data->>'coupon_id')::UUID);
  END IF;

  SELECT to_jsonb(o.*) INTO v_order
  FROM orders o WHERE o.id = v_order_id;

  RETURN v_order;
END;
$$;


-- File: 014_coupon_free_item_product.sql
-- ============================================================
-- Migration 014 : Produit offert lié au coupon free_item
-- Permet de déduire le produit offert du stock automatiquement.
-- ============================================================

ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS free_item_product_id  UUID REFERENCES products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS free_item_quantity     NUMERIC(10,3) NOT NULL DEFAULT 1;


-- File: 016_multiple_coupons.sql
-- ============================================================
-- Migration 016 : Support de plusieurs coupons par commande
-- ============================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS coupon_ids   JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS coupon_codes JSONB NOT NULL DEFAULT '[]'::JSONB;

-- Réécrire create_order pour gérer un tableau de coupons
CREATE OR REPLACE FUNCTION create_order(order_data JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order_id   UUID;
  v_order      JSONB;
  v_item       JSONB;
  v_payment    JSONB;
  v_coupon_id  UUID;
  v_status     TEXT;
  v_pay_method TEXT;
BEGIN
  v_pay_method := order_data->'payment'->>'method';
  IF v_pay_method = 'partial' THEN
    v_status := 'pending';
  ELSE
    v_status := 'paid';
  END IF;

  INSERT INTO orders (
    business_id, cashier_id, status,
    subtotal, tax_amount, discount_amount, total,
    coupon_id, coupon_code, coupon_notes, notes,
    coupon_ids, coupon_codes,
    customer_name, customer_phone
  )
  VALUES (
    (order_data->>'business_id')::UUID,
    (order_data->>'cashier_id')::UUID,
    v_status,
    (order_data->>'subtotal')::NUMERIC,
    (order_data->>'tax_amount')::NUMERIC,
    (order_data->>'discount_amount')::NUMERIC,
    (order_data->>'total')::NUMERIC,
    -- Premier coupon (backward compat)
    NULLIF(order_data->>'coupon_id', '')::UUID,
    order_data->>'coupon_code',
    order_data->>'coupon_notes',
    order_data->>'notes',
    -- Tableau complet
    COALESCE(order_data->'coupon_ids', '[]'::JSONB),
    COALESCE(order_data->'coupon_codes', '[]'::JSONB),
    order_data->>'customer_name',
    order_data->>'customer_phone'
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(order_data->'items')
  LOOP
    INSERT INTO order_items (
      order_id, product_id, variant_id, name,
      price, quantity, discount_amount, total, notes
    )
    VALUES (
      v_order_id,
      (v_item->>'product_id')::UUID,
      NULLIF(v_item->>'variant_id', '')::UUID,
      v_item->>'name',
      (v_item->>'price')::NUMERIC,
      (v_item->>'quantity')::INTEGER,
      COALESCE((v_item->>'discount_amount')::NUMERIC, 0),
      (v_item->>'total')::NUMERIC,
      v_item->>'notes'
    );

    PERFORM decrement_stock(
      (v_item->>'product_id')::UUID,
      (v_item->>'quantity')::INTEGER
    );
  END LOOP;

  IF jsonb_array_length(COALESCE(order_data->'payments', '[]'::JSONB)) > 0 THEN
    FOR v_payment IN SELECT * FROM jsonb_array_elements(order_data->'payments')
    LOOP
      INSERT INTO payments (order_id, method, amount)
      VALUES (v_order_id, v_payment->>'method', (v_payment->>'amount')::NUMERIC);
    END LOOP;
  ELSE
    INSERT INTO payments (order_id, method, amount, reference)
    VALUES (
      v_order_id,
      v_pay_method,
      (order_data->'payment'->>'amount')::NUMERIC,
      order_data->'payment'->>'reference'
    );
  END IF;

  -- Incrémenter uses_count pour tous les coupons utilisés
  FOR v_coupon_id IN
    SELECT (value #>> '{}')::UUID
    FROM jsonb_array_elements(COALESCE(order_data->'coupon_ids', '[]'::JSONB))
  LOOP
    PERFORM increment_coupon_uses(v_coupon_id);
  END LOOP;

  SELECT to_jsonb(o.*) INTO v_order FROM orders o WHERE o.id = v_order_id;
  RETURN v_order;
END;
$$;


-- File: 051_whatsapp_stock_decrement.sql
-- Décrémenter le stock à la validation du paiement des commandes WhatsApp.
-- Les commandes POS passent par create_order() qui décrémente le stock à la création.
-- Les commandes WhatsApp sont insérées directement (Edge Function) sans passer par
-- create_order(), donc le stock n'est jamais décrémenté. On corrige ici en le
-- faisant dans complete_order_payment() quand la commande source='whatsapp' est soldée.

CREATE OR REPLACE FUNCTION complete_order_payment(
  p_order_id UUID,
  p_method   TEXT,
  p_amount   NUMERIC
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_order      orders%ROWTYPE;
  v_total_paid NUMERIC;
  v_item       order_items%ROWTYPE;
BEGIN
  -- Verrouiller la commande
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commande introuvable';
  END IF;

  IF v_order.status NOT IN ('pending') THEN
    RAISE EXCEPTION 'Cette commande ne peut plus recevoir de paiement complémentaire (statut : %)', v_order.status;
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Le montant doit être positif';
  END IF;

  -- Insérer le paiement complémentaire
  INSERT INTO payments (order_id, method, amount)
  VALUES (p_order_id, p_method, p_amount);

  -- Calculer le total payé
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM payments WHERE order_id = p_order_id;

  -- Marquer comme payée si solde atteint
  IF v_total_paid >= v_order.total - 0.01 THEN
    UPDATE orders SET status = 'paid', updated_at = NOW() WHERE id = p_order_id;

    -- Décrémenter le stock pour les commandes WhatsApp
    -- (les commandes POS ont déjà leur stock décrémenté via create_order())
    IF v_order.source = 'whatsapp' THEN
      FOR v_item IN SELECT * FROM order_items WHERE order_id = p_order_id
      LOOP
        PERFORM decrement_stock(v_item.product_id, v_item.quantity);
      END LOOP;
    END IF;
  END IF;
END;
$$;


-- File: 052_menu_du_jour.sql
-- Menu du jour : sélection de produits mis en avant pour une date donnée
CREATE TABLE IF NOT EXISTS daily_menus (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  note        TEXT,                     -- message affiché en intro (ex: "Spécial week-end 🎉")
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, date)
);

CREATE TABLE IF NOT EXISTS daily_menu_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_menu_id UUID NOT NULL REFERENCES daily_menus(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  custom_price  NUMERIC,               -- prix spécial optionnel pour ce jour
  sort_order    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (daily_menu_id, product_id)
);

-- RLS
ALTER TABLE daily_menus       ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_menu_items  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_menus: members" ON daily_menus;
CREATE POLICY "daily_menus: members"
  ON daily_menus FOR ALL
  USING (business_id IN (
    SELECT business_id FROM business_members WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "daily_menu_items: members" ON daily_menu_items;
CREATE POLICY "daily_menu_items: members"
  ON daily_menu_items FOR ALL
  USING (daily_menu_id IN (
    SELECT dm.id FROM daily_menus dm
    JOIN business_members bm ON bm.business_id = dm.business_id
    WHERE bm.user_id = auth.uid()
  ));

-- Service role pour Edge Function WhatsApp
DROP POLICY IF EXISTS "daily_menus: service_role" ON daily_menus;
CREATE POLICY "daily_menus: service_role"
  ON daily_menus FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "daily_menu_items: service_role" ON daily_menu_items;
CREATE POLICY "daily_menu_items: service_role"
  ON daily_menu_items FOR ALL USING (auth.role() = 'service_role');


-- File: 054_daily_menu_image.sql
ALTER TABLE daily_menus ADD COLUMN IF NOT EXISTS image_url TEXT;


-- File: 061_tax_inclusive.sql
-- Ajoute le support TVA incluse dans le prix (prix TTC saisis)
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS tax_inclusive boolean NOT NULL DEFAULT false;


-- File: 087_dossier_storage.sql
-- ─── Configuration Storage Dossiers ──────────────────────────────────────────
-- Migration 087 : Création du bucket sécurisé pour les fichiers de dossiers.

-- 1. Création du bucket s'il n'existe pas
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('dossier-files', 'dossier-files', false, 52428800) -- 50 Mo
ON CONFLICT (id) DO NOTHING;

-- 2. Politiques RLS pour le bucket 'dossier-files'
-- Note : L'utilisateur doit appartenir au business pour accéder aux fichiers.
-- Le storage path est structuré comme : {business_id}/{dossier_id}/{filename}

-- Lecture : Membres du business (owner, admin, manager)
CREATE POLICY "dossier_files_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'dossier-files' AND
    (storage.foldername(name))[1]::uuid IN (
      SELECT business_id FROM public.business_members WHERE user_id = auth.uid()
    )
  );

-- Insertion : Membres du business
CREATE POLICY "dossier_files_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'dossier-files' AND
    (storage.foldername(name))[1]::uuid IN (
      SELECT business_id FROM public.business_members WHERE user_id = auth.uid()
    )
  );

-- Suppression : Admin ou Owner du business
CREATE POLICY "dossier_files_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'dossier-files' AND
    (storage.foldername(name))[1]::uuid IN (
      SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );
