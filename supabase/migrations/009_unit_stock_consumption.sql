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
