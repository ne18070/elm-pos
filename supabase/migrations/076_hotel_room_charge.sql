-- ============================================================
-- ELM APP — Charge to Room Integration
-- ============================================================

-- 1. Link orders to hotel reservations
ALTER TABLE orders 
ADD COLUMN hotel_reservation_id UUID REFERENCES hotel_reservations(id) ON DELETE SET NULL;

CREATE INDEX idx_orders_hotel_reservation ON orders(hotel_reservation_id);

-- 2. Link hotel services to orders (to track source of charge)
ALTER TABLE hotel_services
ADD COLUMN order_id UUID REFERENCES orders(id) ON DELETE CASCADE;

CREATE INDEX idx_hotel_services_order ON hotel_services(order_id);

-- 3. Update payment methods to include room_charge
ALTER TABLE payments 
DROP CONSTRAINT IF EXISTS payments_method_check;

ALTER TABLE payments 
ADD CONSTRAINT payments_method_check 
CHECK (method IN ('cash', 'card', 'mobile_money', 'partial', 'room_charge', 'free'));

-- 4. Update create_order to handle hotel_reservation_id and room_charge
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
  v_hotel_res_id UUID;
BEGIN
  v_pay_method   := order_data->'payment'->>'method';
  v_hotel_res_id := NULLIF(order_data->>'hotel_reservation_id', '')::UUID;

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
    customer_name, customer_phone,
    hotel_reservation_id
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
    COALESCE(order_data->'coupon_ids', '[]'::JSONB),
    COALESCE(order_data->'coupon_codes', '[]'::JSONB),
    order_data->>'customer_name',
    order_data->>'customer_phone',
    v_hotel_res_id
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
      
      -- If any payment is room_charge, link it
      IF v_payment->>'method' = 'room_charge' AND v_hotel_res_id IS NOT NULL THEN
        INSERT INTO hotel_services (business_id, reservation_id, order_id, label, amount, service_date)
        VALUES (
          (order_data->>'business_id')::UUID,
          v_hotel_res_id,
          v_order_id,
          'Restaurant/Bar Order #' || v_order_id,
          (v_payment->>'amount')::NUMERIC,
          NOW()
        );
      END IF;
    END LOOP;
  ELSE
    INSERT INTO payments (order_id, method, amount, reference)
    VALUES (
      v_order_id,
      v_pay_method,
      (order_data->'payment'->>'amount')::NUMERIC,
      order_data->'payment'->>'reference'
    );

    -- If room_charge, link it
    IF v_pay_method = 'room_charge' AND v_hotel_res_id IS NOT NULL THEN
      INSERT INTO hotel_services (business_id, reservation_id, order_id, label, amount, service_date)
      VALUES (
        (order_data->>'business_id')::UUID,
        v_hotel_res_id,
        v_order_id,
        'Restaurant/Bar Order #' || v_order_id,
        (order_data->'payment'->>'amount')::NUMERIC,
        NOW()
      );
    END IF;
  END IF;

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
