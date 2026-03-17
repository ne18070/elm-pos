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
