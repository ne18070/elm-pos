-- ============================================================
-- ELM APP — Boutique publique (catalogue client en ligne)
-- Migration 013
-- ============================================================

-- ─── 1. Colonnes supplémentaires sur orders ──────────────────────────────────

ALTER TABLE orders ADD COLUMN IF NOT EXISTS source          TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_type   TEXT DEFAULT NULL
  CHECK (delivery_type IS NULL OR delivery_type IN ('pickup', 'delivery'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_status  TEXT NOT NULL DEFAULT 'pending'
  CHECK (delivery_status IN ('pending', 'picking', 'delivered'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS livreur_id      UUID DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name   TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone  TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_token   UUID DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_notes    TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_ids      UUID[] DEFAULT '{}';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_codes    TEXT[] DEFAULT '{}';

-- Index utile pour chercher par token de paiement
CREATE INDEX IF NOT EXISTS idx_orders_payment_token ON orders(payment_token) WHERE payment_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_source        ON orders(business_id, source) WHERE source IS NOT NULL;

-- ─── 2. RLS — accès public (rôle anon) ──────────────────────────────────────

-- Businesses : lecture publique des informations non-sensibles
DROP POLICY IF EXISTS "businesses_public_read" ON businesses;
CREATE POLICY "businesses_public_read" ON businesses
  FOR SELECT TO anon
  USING (true);

-- Products : lecture publique des produits actifs
DROP POLICY IF EXISTS "products_public_read" ON products;
CREATE POLICY "products_public_read" ON products
  FOR SELECT TO anon
  USING (is_active = true);

-- Categories : lecture publique
DROP POLICY IF EXISTS "categories_public_read" ON categories;
CREATE POLICY "categories_public_read" ON categories
  FOR SELECT TO anon
  USING (true);

-- Orders : lecture publique via token de paiement (pour la page de confirmation)
DROP POLICY IF EXISTS "orders_public_token_read" ON orders;
CREATE POLICY "orders_public_token_read" ON orders
  FOR SELECT TO anon
  USING (payment_token IS NOT NULL AND source = 'boutique');

-- order_items : lecture publique si la commande est une commande boutique
DROP POLICY IF EXISTS "order_items_public_read" ON order_items;
CREATE POLICY "order_items_public_read" ON order_items
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
        AND o.source = 'boutique'
        AND o.payment_token IS NOT NULL
    )
  );

-- ─── 3. RPC create_boutique_order (SECURITY DEFINER = bypass RLS) ───────────

CREATE OR REPLACE FUNCTION create_boutique_order(order_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business      RECORD;
  v_order_id      UUID;
  v_token         UUID;
  v_item          JSONB;
  v_subtotal      NUMERIC := 0;
  v_payment_method TEXT;
BEGIN
  -- Charger le business et vérifier qu'il existe
  SELECT id, owner_id, tax_rate, tax_inclusive
  INTO v_business
  FROM businesses
  WHERE id = (order_data->>'business_id')::UUID;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Business introuvable';
  END IF;

  -- Vérifier que le business owner existe dans la table users
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = v_business.owner_id) THEN
    RAISE EXCEPTION 'Propriétaire du business introuvable';
  END IF;

  -- Calculer le sous-total
  FOR v_item IN SELECT * FROM jsonb_array_elements(order_data->'items')
  LOOP
    v_subtotal := v_subtotal
      + (v_item->>'price')::NUMERIC
      * (v_item->>'quantity')::INTEGER;
  END LOOP;

  v_order_id      := gen_random_uuid();
  v_token         := gen_random_uuid();
  v_payment_method := COALESCE(order_data->>'payment_method', 'cash');

  -- Insérer la commande
  INSERT INTO orders (
    id, business_id, cashier_id, status,
    subtotal, tax_amount, discount_amount, total,
    customer_name, customer_phone, delivery_address,
    delivery_type, delivery_status,
    source, payment_token,
    notes,
    created_at, updated_at
  ) VALUES (
    v_order_id,
    v_business.id,
    v_business.owner_id,
    'pending',
    v_subtotal, 0, 0, v_subtotal,
    order_data->>'customer_name',
    order_data->>'customer_phone',
    order_data->>'delivery_address',
    COALESCE(order_data->>'delivery_type', 'pickup'),
    'pending',
    'boutique',
    v_token,
    order_data->>'notes',
    NOW(), NOW()
  );

  -- Insérer les articles
  FOR v_item IN SELECT * FROM jsonb_array_elements(order_data->'items')
  LOOP
    INSERT INTO order_items (
      id, order_id, product_id, variant_id,
      name, price, quantity, discount_amount, total
    ) VALUES (
      gen_random_uuid(),
      v_order_id,
      (v_item->>'product_id')::UUID,
      NULLIF(v_item->>'variant_id', ''),
      v_item->>'name',
      (v_item->>'price')::NUMERIC,
      (v_item->>'quantity')::INTEGER,
      0,
      (v_item->>'price')::NUMERIC * (v_item->>'quantity')::INTEGER
    );

    -- Décrémenter le stock si tracking activé
    UPDATE products
    SET stock = GREATEST(0, COALESCE(stock, 0) - (v_item->>'quantity')::INTEGER)
    WHERE id = (v_item->>'product_id')::UUID
      AND track_stock = true;
  END LOOP;

  RETURN jsonb_build_object(
    'id',            v_order_id,
    'payment_token', v_token
  );
END;
$$;

-- Accorder l'accès à la fonction pour le rôle anon
GRANT EXECUTE ON FUNCTION create_boutique_order(JSONB) TO anon;

-- ─── 4. Fonction publique pour récupérer une commande boutique ───────────────

CREATE OR REPLACE FUNCTION get_boutique_order(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order  RECORD;
  v_items  JSONB;
BEGIN
  SELECT o.id, o.status, o.subtotal, o.total,
         o.customer_name, o.customer_phone, o.delivery_address,
         o.delivery_type, o.delivery_status, o.source,
         o.notes, o.created_at
  INTO v_order
  FROM orders o
  WHERE o.payment_token = p_token
    AND o.source = 'boutique'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'name',     oi.name,
      'price',    oi.price,
      'quantity', oi.quantity,
      'total',    oi.total
    )
  )
  INTO v_items
  FROM order_items oi
  WHERE oi.order_id = v_order.id;

  RETURN jsonb_build_object(
    'id',               v_order.id,
    'status',           v_order.status,
    'subtotal',         v_order.subtotal,
    'total',            v_order.total,
    'customer_name',    v_order.customer_name,
    'customer_phone',   v_order.customer_phone,
    'delivery_address', v_order.delivery_address,
    'delivery_type',    v_order.delivery_type,
    'delivery_status',  v_order.delivery_status,
    'notes',            v_order.notes,
    'created_at',       v_order.created_at,
    'items',            COALESCE(v_items, '[]'::JSONB)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_boutique_order(UUID) TO anon;
