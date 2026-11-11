-- ============================================================================
-- Migration 168 : create_order — l'appelant doit appartenir à l'établissement
--
-- create_order est SECURITY DEFINER (contourne la RLS) et prenait business_id
-- et cashier_id tels qu'envoyés : n'importe quel compte connecté pouvait créer
-- des ventes « payées » dans l'établissement de son choix (UUID visibles dans
-- les URL publiques /boutique/<id>) — stock décrémenté, coupons consommés,
-- points fidélité de ses clients débités.
--
-- Désormais, hors service_role (API v1, déjà authentifiée par clé API) et
-- superadmin :
--   - l'appelant doit être membre (business_members, comme get_my_businesses)
--     ou propriétaire de l'établissement ;
--   - le caissier enregistré doit appartenir au même établissement. Pas
--     forcément l'appelant : une vente hors ligne est rejouée par l'utilisateur
--     connecté au retour du réseau, qui peut être un autre caissier.
-- anon perd l'exécution (la boutique publique passe par create_boutique_order).
--
-- Corps identique à 157 (stock_qty + source de la vente) ; seul le bloc
-- « Contrôle d'accès » est ajouté en tête.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_order(order_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id        UUID;
  v_order           JSONB;
  v_item            JSONB;
  v_payment         JSONB;
  v_status          TEXT;
  v_pay_method      TEXT;
  v_pay_amount      NUMERIC;
  v_hotel_res_id    UUID;
  v_business_id     UUID := (order_data->>'business_id')::UUID;
  v_client_order_id UUID := NULLIF(order_data->>'client_order_id', '')::UUID;
  v_need            NUMERIC;
  v_stock           NUMERIC;
  v_track           BOOLEAN;
  v_pname           TEXT;
  v_sub_in          NUMERIC;
  v_disc_in         NUMERIC;
  v_item_count      NUMERIC;
  v_cid             UUID;
  v_c               coupons%ROWTYPE;
  v_lty_name        TEXT;
  v_lty_points      INTEGER;
  v_lty_active      BOOLEAN;
  v_lty_pvalue      NUMERIC;
  v_lty_min         INTEGER;
  v_lty_balance     INTEGER;
BEGIN
  -- ── Contrôle d'accès (migration 168) ───────────────────────────────────────
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT COALESCE(public.is_superadmin(), false) THEN
    IF auth.uid() IS NULL OR NOT (
      EXISTS (SELECT 1 FROM public.business_members bm
               WHERE bm.business_id = v_business_id AND bm.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.businesses b
                  WHERE b.id = v_business_id AND b.owner_id = auth.uid())
    ) THEN
      RAISE EXCEPTION 'ACCES_REFUSE: vous n''êtes pas membre de cet établissement'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NOT (
      EXISTS (SELECT 1 FROM public.business_members bm
               WHERE bm.business_id = v_business_id
                 AND bm.user_id = NULLIF(order_data->>'cashier_id', '')::UUID)
      OR EXISTS (SELECT 1 FROM public.businesses b
                  WHERE b.id = v_business_id
                    AND b.owner_id = NULLIF(order_data->>'cashier_id', '')::UUID)
    ) THEN
      RAISE EXCEPTION 'ACCES_REFUSE: caissier inconnu dans cet établissement'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  v_pay_method   := order_data->'payment'->>'method';
  v_pay_amount   := (order_data->'payment'->>'amount')::NUMERIC;
  v_hotel_res_id := NULLIF(order_data->>'hotel_reservation_id', '')::UUID;

  -- C1 — borne de sécurité sur la remise (pas de recalcul complet ici, mais
  -- on refuse une remise négative ou supérieure au sous-total).
  v_sub_in  := (order_data->>'subtotal')::NUMERIC;
  v_disc_in := COALESCE((order_data->>'discount_amount')::NUMERIC, 0);
  IF v_disc_in < 0 OR v_disc_in > COALESCE(v_sub_in, 0) + 0.01 THEN
    RAISE EXCEPTION 'REMISE_INVALIDE: remise % pour un sous-total %', v_disc_in, v_sub_in
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_client_order_id IS NOT NULL THEN
    SELECT id INTO v_order_id
    FROM orders
    WHERE business_id = v_business_id AND client_order_id = v_client_order_id;
    IF FOUND THEN
      SELECT to_jsonb(o.*) INTO v_order FROM orders o WHERE o.id = v_order_id;
      RETURN v_order;
    END IF;
  END IF;

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
    order_channel, delivery_address,
    client_order_id
  )
  VALUES (
    v_business_id,
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
    NULLIF(order_data->>'delivery_address', ''),
    v_client_order_id
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(order_data->'items')
  LOOP
    v_need := (v_item->>'quantity')::NUMERIC
            * COALESCE(NULLIF(v_item->>'stock_consumption', '')::NUMERIC, 1);

    SELECT stock, track_stock, name
      INTO v_stock, v_track, v_pname
    FROM products
    WHERE id = (v_item->>'product_id')::UUID
    FOR UPDATE;

    IF COALESCE(v_track, FALSE) AND COALESCE(v_stock, 0) < v_need THEN
      RAISE EXCEPTION 'STOCK_INSUFFISANT: % (reste %, demandé %)',
        COALESCE(v_pname, v_item->>'name'), COALESCE(v_stock, 0), v_need
        USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO order_items (
      order_id, product_id, variant_id, name,
      price, quantity, discount_amount, total, notes, stock_qty
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
      v_item->>'notes',
      v_need
    );

    PERFORM decrement_stock((v_item->>'product_id')::UUID, v_need, v_order_id);
  END LOOP;

  IF jsonb_array_length(COALESCE(order_data->'payments', '[]'::JSONB)) > 0 THEN
    FOR v_payment IN SELECT * FROM jsonb_array_elements(order_data->'payments')
    LOOP
      IF (v_payment->>'amount')::NUMERIC > 0 THEN
        INSERT INTO payments (order_id, method, amount)
        VALUES (v_order_id, v_payment->>'method', (v_payment->>'amount')::NUMERIC);
      END IF;

      IF v_payment->>'method' = 'room_charge' AND v_hotel_res_id IS NOT NULL THEN
        INSERT INTO hotel_services (business_id, reservation_id, order_id, label, amount, service_date)
        VALUES (
          v_business_id, v_hotel_res_id, v_order_id,
          'Restaurant/Bar Order #' || v_order_id,
          (v_payment->>'amount')::NUMERIC, NOW()
        );
      END IF;
    END LOOP;
  ELSE
    IF v_pay_amount > 0 THEN
      INSERT INTO payments (order_id, method, amount, reference)
      VALUES (v_order_id, v_pay_method, v_pay_amount, order_data->'payment'->>'reference');
    END IF;

    IF v_pay_method = 'room_charge' AND v_hotel_res_id IS NOT NULL THEN
      INSERT INTO hotel_services (business_id, reservation_id, order_id, label, amount, service_date)
      VALUES (
        v_business_id, v_hotel_res_id, v_order_id,
        'Restaurant/Bar Order #' || v_order_id,
        v_pay_amount, NOW()
      );
    END IF;
  END IF;

  -- C1 — validation + verrou de chaque coupon appliqué, puis incrément.
  SELECT COALESCE(SUM((value->>'quantity')::NUMERIC), 0)
    INTO v_item_count
  FROM jsonb_array_elements(COALESCE(order_data->'items', '[]'::JSONB));

  FOR v_cid IN
    SELECT (value #>> '{}')::UUID
    FROM jsonb_array_elements(COALESCE(order_data->'coupon_ids', '[]'::JSONB))
  LOOP
    SELECT * INTO v_c FROM coupons WHERE id = v_cid FOR UPDATE;

    IF NOT FOUND OR v_c.business_id IS DISTINCT FROM v_business_id THEN
      RAISE EXCEPTION 'COUPON_INVALIDE: %', v_cid USING ERRCODE = 'check_violation';
    END IF;
    IF NOT v_c.is_active THEN
      RAISE EXCEPTION 'COUPON_INACTIF: %', v_c.code USING ERRCODE = 'check_violation';
    END IF;
    -- NB : l'expiration n'est PAS bloquante ici — une commande créée hors ligne
    -- puis rejouée après l'échéance ne doit pas échouer. L'expiration est
    -- contrôlée au point de vente (validate_coupon + filtres client).
    IF v_c.max_uses IS NOT NULL AND v_c.uses_count >= v_c.max_uses THEN
      RAISE EXCEPTION 'COUPON_EPUISE: %', v_c.code USING ERRCODE = 'check_violation';
    END IF;
    IF v_c.min_order_amount IS NOT NULL AND COALESCE(v_sub_in, 0) < v_c.min_order_amount THEN
      RAISE EXCEPTION 'COUPON_MIN_COMMANDE: % (min %)', v_c.code, v_c.min_order_amount
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_c.min_quantity IS NOT NULL AND v_item_count < v_c.min_quantity THEN
      RAISE EXCEPTION 'COUPON_MIN_QUANTITE: % (min % articles)', v_c.code, v_c.min_quantity
        USING ERRCODE = 'check_violation';
    END IF;

    UPDATE coupons SET uses_count = uses_count + 1 WHERE id = v_cid;
  END LOOP;

  -- H2 — rachat de points fidélité DANS la transaction.
  IF COALESCE((order_data->'loyalty_redeem'->>'points')::INTEGER, 0) > 0 THEN
    v_lty_name   := btrim(order_data->'loyalty_redeem'->>'client_name');
    v_lty_points := (order_data->'loyalty_redeem'->>'points')::INTEGER;

    IF v_lty_name IS NULL OR v_lty_name = '' THEN
      RAISE EXCEPTION 'FIDELITE_CLIENT_MANQUANT' USING ERRCODE = 'check_violation';
    END IF;

    SELECT is_active, point_value, min_redeem
      INTO v_lty_active, v_lty_pvalue, v_lty_min
    FROM loyalty_config
    WHERE business_id = v_business_id;

    IF NOT COALESCE(v_lty_active, FALSE) THEN
      RAISE EXCEPTION 'FIDELITE_INACTIVE' USING ERRCODE = 'check_violation';
    END IF;

    SELECT COALESCE(SUM(
             CASE
               WHEN type = 'earn' AND (expires_at IS NULL OR expires_at >= CURRENT_DATE) THEN points
               WHEN type <> 'earn' THEN points
               ELSE 0
             END), 0)
      INTO v_lty_balance
    FROM loyalty_transactions
    WHERE business_id = v_business_id
      AND lower(btrim(client_name)) = lower(v_lty_name);

    IF v_lty_balance < v_lty_points THEN
      RAISE EXCEPTION 'FIDELITE_SOLDE_INSUFFISANT: solde % pts, requis % pts',
        v_lty_balance, v_lty_points USING ERRCODE = 'check_violation';
    END IF;

    IF v_lty_points < COALESCE(v_lty_min, 1) THEN
      RAISE EXCEPTION 'FIDELITE_MIN_NON_ATTEINT: % pts requis', COALESCE(v_lty_min, 1)
        USING ERRCODE = 'check_violation';
    END IF;

    IF (order_data->'loyalty_redeem'->>'cash_value') IS NOT NULL
       AND ABS(v_lty_points * COALESCE(v_lty_pvalue, 0)
               - (order_data->'loyalty_redeem'->>'cash_value')::NUMERIC) > 0.5
    THEN
      RAISE EXCEPTION 'FIDELITE_VALEUR_INCOHERENTE' USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO loyalty_transactions (
      business_id, client_name, client_phone, type, points, order_id, note
    )
    VALUES (
      v_business_id,
      v_lty_name,
      NULLIF(btrim(order_data->'loyalty_redeem'->>'client_phone'), ''),
      'redeem',
      -v_lty_points,
      v_order_id,
      'Remise ' || round(v_lty_points * COALESCE(v_lty_pvalue, 0))::TEXT || ' CFA'
    );
  END IF;

  SELECT to_jsonb(o.*) INTO v_order FROM orders o WHERE o.id = v_order_id;
  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.create_order(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order(jsonb) TO authenticated, service_role;
