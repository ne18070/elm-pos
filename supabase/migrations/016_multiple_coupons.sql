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
