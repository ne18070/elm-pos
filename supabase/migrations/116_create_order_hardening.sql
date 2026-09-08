-- ============================================================================
-- Migration 116 : fiabilisation de create_order (caisse)
--
--   C6. payments.method : la migration 086 a redéfini la contrainte en ne
--       gardant que ('cash','card','mobile_money','partial','loyalty') — elle a
--       PERDU 'room_charge' et 'free' ajoutés par la 007. Résultat : toute
--       vente hôtel « note de chambre » viole la CHECK et échoue. On rétablit
--       l'ensemble complet.
--
--   C3. Idempotence : la file de synchro offline rejoue create_order sans clé.
--       Si la réponse se perd après commit → commande dupliquée. On ajoute
--       orders.client_order_id (UUID généré par le client) + index unique ;
--       un rejeu avec le même id renvoie la commande existante sans rien créer.
--
--   C4. Validation de stock : decrement_stock fait GREATEST(0, stock - qty) et
--       ne rejette jamais une survente. On verrouille chaque produit suivi
--       (FOR UPDATE) et on lève une exception explicite si le stock est
--       insuffisant — le client affiche alors le refus au lieu de croire la
--       vente passée.
--
--   C5. stock_consumption : une variante conditionnée (« pack de 6 ») consomme
--       6 unités de base. Le payload le transporte déjà (items[].stock_consumption)
--       mais le décrément l'ignorait. On multiplie enfin.
--
--   H2. Rachat de points fidélité atomique : l'ancien flux appelait redeemPoints()
--       APRÈS create_order, hors transaction. Si ce second appel échouait (réseau,
--       onglet fermé), la commande gardait sa remise fidélité (ligne de paiement
--       method='loyalty') mais les points n'étaient jamais débités — le client
--       gardait ses points ET la remise. On débite désormais dans create_order,
--       sous le même verrou : tout échec annule la vente entière.
-- ============================================================================

-- ─── C6. Contrainte payments.method complète ───────────────────────────────
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_method_check
  CHECK (method IN ('cash', 'card', 'mobile_money', 'partial', 'loyalty', 'room_charge', 'free'));

-- ─── C3. Colonne d'idempotence ────────────────────────────────────────────
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS client_order_id uuid;
COMMENT ON COLUMN public.orders.client_order_id IS
  'UUID généré par le client avant l''appel create_order. Rend le rejeu (file de synchro offline) idempotent.';
CREATE UNIQUE INDEX IF NOT EXISTS orders_client_order_id_uidx
  ON public.orders (business_id, client_order_id)
  WHERE client_order_id IS NOT NULL;

-- ─── create_order : idempotence + verrou/stock + consumption + fidélité ────
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
  v_coupon_id       UUID;
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
  v_lty_name        TEXT;
  v_lty_points      INTEGER;
  v_lty_active      BOOLEAN;
  v_lty_pvalue      NUMERIC;
  v_lty_min         INTEGER;
  v_lty_balance     INTEGER;
BEGIN
  v_pay_method   := order_data->'payment'->>'method';
  v_pay_amount   := (order_data->'payment'->>'amount')::NUMERIC;
  v_hotel_res_id := NULLIF(order_data->>'hotel_reservation_id', '')::UUID;

  -- C3 — rejeu idempotent : si une commande porte déjà ce client_order_id,
  -- on la renvoie telle quelle (aucun doublon, aucun stock re-décrémenté).
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
    -- Besoin réel en unités de base = quantité × stock_consumption
    v_need := (v_item->>'quantity')::NUMERIC
            * COALESCE(NULLIF(v_item->>'stock_consumption', '')::NUMERIC, 1);

    -- C4 — verrou + contrôle : on ne laisse jamais passer une survente.
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

    -- C5 — décrément au besoin réel (base units), plus « quantity » seul.
    PERFORM decrement_stock((v_item->>'product_id')::UUID, v_need);
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

  FOR v_coupon_id IN
    SELECT (value #>> '{}')::UUID
    FROM jsonb_array_elements(COALESCE(order_data->'coupon_ids', '[]'::JSONB))
  LOOP
    PERFORM increment_coupon_uses(v_coupon_id);
  END LOOP;

  -- H2 — rachat de points fidélité DANS la transaction. La remise est déjà
  -- portée par une ligne de paiement method='loyalty' (montant = cash_value) ;
  -- ici on débite les points correspondants. Toute anomalie => RAISE => la
  -- commande, les lignes, le stock et le paiement sont annulés ensemble.
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

    -- Solde recalculé maintenant — même formule que get_public_loyalty (085) :
    -- earn non expirés + redeem/expire/adjust.
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

    -- Cohérence : points débités × valeur du point = remise portée par la commande.
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

GRANT EXECUTE ON FUNCTION public.create_order(JSONB) TO authenticated, service_role;
