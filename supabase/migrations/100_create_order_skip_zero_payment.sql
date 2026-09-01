-- Migration 100 : ne pas insérer de paiement à 0 F dans create_order
--
-- Bug : la table payments a `amount NUMERIC(12,2) NOT NULL CHECK (amount > 0)`
-- (migration 003). Le bon de livraison POS (« Livrer sans encaisser », PaymentModal
-- → submitDeliveryNote) crée une commande avec payment.amount = 0 (rien n'est
-- encaissé, le solde total reste dû). Le RPC create_order (dernière définition :
-- 099) insère toujours une ligne payments pour ce montant quand aucun tableau
-- `payments` n'est fourni — la CHECK (amount > 0) rejette l'insertion, l'erreur
-- fait échouer TOUTE la transaction (orders + order_items + décrément de stock
-- inclus), et create_order lève une exception.
--
-- Côté client, cette exception est interceptée par le bloc "hors ligne" de
-- PaymentModal.submitDeliveryNote, qui affiche un succès trompeur et tente un
-- enqueueToSync — no-op en mode web (pas d'IPC Electron). Résultat : le bon de
-- livraison n'est jamais réellement enregistré, et n'apparaît donc pas dans
-- /orders (Commandes) ni dans /livraison.
--
-- Cette migration redéfinit create_order à l'identique de la version 099, en
-- sautant simplement l'INSERT INTO payments quand le montant est 0 (aucun
-- paiement à 0 F n'a de sens métier de toute façon — un solde non réglé se lit
-- déjà par l'absence de ligne payments, pas par une ligne à 0).

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
  v_pay_amount NUMERIC;
  v_hotel_res_id UUID;
BEGIN
  v_pay_method   := order_data->'payment'->>'method';
  v_pay_amount   := (order_data->'payment'->>'amount')::NUMERIC;
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
    hotel_reservation_id,
    reseller_id, reseller_client_id, order_type,
    order_channel, delivery_address
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
    v_hotel_res_id,
    NULLIF(order_data->>'reseller_id', '')::UUID,
    NULLIF(order_data->>'reseller_client_id', '')::UUID,
    CASE
      WHEN NULLIF(order_data->>'reseller_id', '') IS NOT NULL THEN 'wholesale'
      ELSE COALESCE(order_data->>'order_type', 'retail')
    END,
    COALESCE(NULLIF(order_data->>'order_channel', ''), 'salle'),
    NULLIF(order_data->>'delivery_address', '')
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
      IF (v_payment->>'amount')::NUMERIC > 0 THEN
        INSERT INTO payments (order_id, method, amount)
        VALUES (v_order_id, v_payment->>'method', (v_payment->>'amount')::NUMERIC);
      END IF;

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
    -- Un bon de livraison ("livrer sans encaisser") passe payment.amount = 0 :
    -- rien n'a encore été payé, donc aucune ligne payments à créer (la CHECK
    -- amount > 0 la rejetterait de toute façon).
    IF v_pay_amount > 0 THEN
      INSERT INTO payments (order_id, method, amount, reference)
      VALUES (
        v_order_id,
        v_pay_method,
        v_pay_amount,
        order_data->'payment'->>'reference'
      );
    END IF;

    -- If room_charge, link it
    IF v_pay_method = 'room_charge' AND v_hotel_res_id IS NOT NULL THEN
      INSERT INTO hotel_services (business_id, reservation_id, order_id, label, amount, service_date)
      VALUES (
        (order_data->>'business_id')::UUID,
        v_hotel_res_id,
        v_order_id,
        'Restaurant/Bar Order #' || v_order_id,
        v_pay_amount,
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

GRANT EXECUTE ON FUNCTION public.create_order(JSONB) TO authenticated, service_role;
