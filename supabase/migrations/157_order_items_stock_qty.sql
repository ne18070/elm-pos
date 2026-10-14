-- ============================================================================
-- Migration 157 : restitution exacte du stock (variantes / conditionnement)
--
-- Écarts physique ↔ application encore signalés après la migration 155.
-- Causes trouvées :
--
--   E1. create_order décrémente quantity × stock_consumption (variante
--       « Carton » = 12 unités, article offert « tablette » = 1/12…), mais
--       order_items ne garde que quantity. cancel_order, refund_order et
--       update_pending_order restituaient donc quantity : annuler 1 carton
--       rendait 1 unité au lieu de 12 (stock appli < stock physique), annuler
--       une tablette offerte rendait 1 carton entier (stock appli > physique).
--       → nouvelle colonne order_items.stock_qty = stock réellement décrémenté,
--         utilisée pour toute restitution (repli sur quantity pour l'historique).
--
--   E2. create_boutique_order (boutique web + appli ELM Boutique) :
--       - ignorait stock_consumption des variantes (1 carton commandé = 1 unité) ;
--       - ne contrôlait pas le stock et le plafonnait à 0 (GREATEST) : les
--         unités commandées en trop disparaissaient sans trace ;
--       - ne posait aucun motif → journal « ajustement » au lieu de « vente ».
--
--   E3. update_pending_order acceptait une quantité décimale (1,5) mais
--       order_items.quantity est INTEGER : la ligne était arrondie (2) alors que
--       le stock bougeait de 1,5. Quantité entière désormais exigée.
--
--   E4. `stock + qty` sur un stock NULL donnait NULL : la restitution était
--       perdue. COALESCE partout.
--
--   + create_order transmet l'id de commande à decrement_stock : les lignes
--     « vente » du journal sont enfin reliées à leur commande (source_id).
-- ============================================================================


-- ─── Colonne + helper ──────────────────────────────────────────────────────
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS stock_qty NUMERIC(12,3);

COMMENT ON COLUMN public.order_items.stock_qty IS
  'Unités de stock réellement décrémentées pour la ligne (quantity × stock_consumption). NULL = historique : quantity.';

-- Consommation de stock d'une variante (products.variants JSONB), 1 par défaut.
CREATE OR REPLACE FUNCTION public._variant_stock_consumption(
  p_product_id uuid,
  p_variant_id text
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT (v->>'stock_consumption')::numeric
    FROM products p,
         jsonb_array_elements(
           CASE WHEN jsonb_typeof(p.variants) = 'array' THEN p.variants ELSE '[]'::jsonb END
         ) v
    WHERE p.id = p_product_id
      AND p_variant_id IS NOT NULL
      AND v->>'id' = p_variant_id
      AND jsonb_typeof(v->'stock_consumption') = 'number'
      AND (v->>'stock_consumption')::numeric > 0
    LIMIT 1
  ), 1);
$$;

REVOKE ALL ON FUNCTION public._variant_stock_consumption(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._variant_stock_consumption(uuid, text) TO authenticated, service_role;

-- Rattrapage des lignes à variante passées par create_order (meilleure
-- approximation : définition actuelle de la variante). Les commandes boutique
-- sont exclues : elles n'avaient décrémenté que quantity.
UPDATE public.order_items oi
SET stock_qty = oi.quantity * public._variant_stock_consumption(oi.product_id, oi.variant_id)
FROM public.orders o
WHERE o.id = oi.order_id
  AND oi.stock_qty IS NULL
  AND oi.product_id IS NOT NULL
  AND oi.variant_id IS NOT NULL
  AND COALESCE(o.source, '') <> 'boutique';


-- ─── create_order : stock_qty + source de la vente (corps 119) ─────────────
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

GRANT EXECUTE ON FUNCTION public.create_order(jsonb) TO authenticated, service_role;


-- ─── cancel_order : restitue stock_qty (corps 121) ─────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_item  order_items%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commande introuvable';
  END IF;

  IF v_order.status NOT IN ('paid', 'pending') THEN
    RAISE EXCEPTION 'Impossible d''annuler une commande avec le statut : %', v_order.status;
  END IF;

  PERFORM set_config('app.stock_reason', 'annulation', true);
  PERFORM set_config('app.stock_source_id', p_order_id::text, true);

  FOR v_item IN
    SELECT * FROM order_items WHERE order_id = p_order_id
  LOOP
    UPDATE products
    SET stock      = COALESCE(stock, 0) + COALESCE(v_item.stock_qty, v_item.quantity),
        updated_at = NOW()
    WHERE id = v_item.product_id
      AND track_stock = true;
  END LOOP;

  PERFORM _release_order_coupons(v_order.coupon_id, v_order.coupon_ids);

  UPDATE orders
  SET status     = 'cancelled',
      updated_at = NOW()
  WHERE id = p_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_order(uuid) TO authenticated, service_role;


-- ─── refund_order : restitue stock_qty (corps 121) ─────────────────────────
CREATE OR REPLACE FUNCTION public.refund_order(
  p_order_id    UUID,
  p_amount      NUMERIC,
  p_reason      TEXT    DEFAULT NULL,
  p_refunded_by UUID    DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_item  order_items%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commande introuvable';
  END IF;

  IF v_order.status <> 'paid' THEN
    RAISE EXCEPTION 'Seules les commandes payées peuvent être remboursées (statut actuel : %)', v_order.status;
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Le montant du remboursement doit être positif';
  END IF;

  IF p_amount > v_order.total THEN
    RAISE EXCEPTION 'Le remboursement (%) dépasse le total de la commande (%)',
      p_amount, v_order.total;
  END IF;

  IF p_amount = v_order.total THEN
    PERFORM set_config('app.stock_reason', 'remboursement', true);
    PERFORM set_config('app.stock_source_id', p_order_id::text, true);

    FOR v_item IN
      SELECT * FROM order_items WHERE order_id = p_order_id
    LOOP
      UPDATE products
      SET stock      = COALESCE(stock, 0) + COALESCE(v_item.stock_qty, v_item.quantity),
          updated_at = NOW()
      WHERE id = v_item.product_id
        AND track_stock = true;
    END LOOP;

    PERFORM _release_order_coupons(v_order.coupon_id, v_order.coupon_ids);
  END IF;

  INSERT INTO refunds (order_id, amount, reason, refunded_by)
  VALUES (p_order_id, p_amount, p_reason, p_refunded_by);

  UPDATE orders
  SET status     = 'refunded',
      updated_at = NOW()
  WHERE id = p_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refund_order(uuid, numeric, text, uuid) TO authenticated, service_role;


-- ─── update_pending_order : consommation conservée + quantité entière ──────
-- La consommation par unité d'une ligne est déduite côté serveur : d'abord la
-- ligne d'origine équivalente (même produit, variante et prix — couvre les
-- articles offerts à consommation fractionnaire), sinon la définition de la
-- variante, sinon 1.
CREATE OR REPLACE FUNCTION public.update_pending_order(
  p_order_id        uuid,
  p_items           jsonb,
  p_tax_rate        numeric DEFAULT 0,
  p_tax_inclusive   boolean DEFAULT false,
  p_customer_name   text    DEFAULT NULL,
  p_customer_phone  text    DEFAULT NULL,
  p_notes           text    DEFAULT NULL,
  p_discount_amount numeric DEFAULT NULL,
  p_remove_coupon   boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order    orders%ROWTYPE;
  v_item     order_items%ROWTYPE;
  v_row      jsonb;
  v_old      jsonb;
  v_paid     numeric;
  v_qty      numeric;
  v_price    numeric;
  v_pid      uuid;
  v_vid      text;
  v_cons     numeric;
  v_need     numeric;
  v_stock    numeric;
  v_track    boolean;
  v_subtotal numeric := 0;
  v_taxable  numeric;
  v_tax      numeric;
  v_total    numeric;
  v_discount numeric;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commande introuvable';
  END IF;
  IF v_order.business_id <> get_user_business_id() THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;
  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'Seules les commandes en attente sont modifiables (statut : %)', v_order.status;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM payments WHERE order_id = p_order_id;
  IF v_paid > 0 THEN
    RAISE EXCEPTION 'Commande déjà partiellement encaissée — modification impossible';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Au moins un article est requis';
  END IF;

  PERFORM set_config('app.stock_reason', 'modif_commande', true);
  PERFORM set_config('app.stock_source_id', p_order_id::text, true);

  -- Consommation par unité des lignes d'origine, avant suppression.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'product_id', product_id,
           'variant_id', variant_id,
           'price',      price,
           'cons',       COALESCE(stock_qty, quantity)::numeric / NULLIF(quantity, 0)
         )), '[]'::jsonb)
    INTO v_old
  FROM order_items WHERE order_id = p_order_id;

  FOR v_item IN SELECT * FROM order_items WHERE order_id = p_order_id LOOP
    UPDATE products
    SET stock = COALESCE(stock, 0) + COALESCE(v_item.stock_qty, v_item.quantity), updated_at = NOW()
    WHERE id = v_item.product_id AND track_stock = true;
  END LOOP;

  DELETE FROM order_items WHERE order_id = p_order_id;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty   := COALESCE((v_row->>'quantity')::numeric, 0);
    v_price := COALESCE((v_row->>'price')::numeric, 0);
    v_pid   := (v_row->>'product_id')::uuid;
    v_vid   := NULLIF(v_row->>'variant_id', '');
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantité invalide pour « % »', COALESCE(v_row->>'name', '?');
    END IF;
    IF v_qty <> trunc(v_qty) THEN
      RAISE EXCEPTION 'Quantité entière requise pour « % » (reçu %)', COALESCE(v_row->>'name', '?'), v_qty;
    END IF;

    SELECT (o->>'cons')::numeric INTO v_cons
    FROM jsonb_array_elements(v_old) o
    WHERE o->>'product_id' = v_pid::text
      AND (o->>'variant_id') IS NOT DISTINCT FROM v_vid
    ORDER BY ((o->>'price')::numeric = v_price) DESC
    LIMIT 1;
    v_cons := COALESCE(NULLIF(v_cons, 0), _variant_stock_consumption(v_pid, v_vid));
    v_need := v_qty * v_cons;

    SELECT stock, track_stock INTO v_stock, v_track
    FROM products WHERE id = v_pid FOR UPDATE;

    IF COALESCE(v_track, false) AND COALESCE(v_stock, 0) < v_need THEN
      RAISE EXCEPTION 'Stock insuffisant pour « % » : % en stock, % demandé(s)',
        COALESCE(v_row->>'name', '?'), COALESCE(v_stock, 0), v_need;
    END IF;

    INSERT INTO order_items
      (order_id, product_id, variant_id, name, price, quantity, discount_amount, total, notes, stock_qty)
    VALUES (
      p_order_id,
      v_pid,
      v_vid,
      COALESCE(v_row->>'name', ''),
      v_price,
      v_qty,
      0,
      v_price * v_qty,
      v_row->>'notes',
      v_need
    );

    UPDATE products
    SET stock = COALESCE(stock, 0) - v_need, updated_at = NOW()
    WHERE id = v_pid AND track_stock = true;

    v_subtotal := v_subtotal + v_price * v_qty;
  END LOOP;

  v_discount := COALESCE(p_discount_amount, v_order.discount_amount, 0);
  IF v_discount < 0 THEN
    RAISE EXCEPTION 'La remise ne peut pas être négative';
  END IF;
  IF v_discount > v_subtotal THEN
    RAISE EXCEPTION 'La remise (%) dépasse le sous-total (%)', v_discount, v_subtotal;
  END IF;

  IF p_remove_coupon THEN
    PERFORM _release_order_coupons(v_order.coupon_id, v_order.coupon_ids);
  END IF;

  v_taxable := v_subtotal - v_discount;
  IF p_tax_inclusive THEN
    v_total := v_taxable;
    v_tax   := CASE WHEN p_tax_rate > 0 THEN round(v_taxable * p_tax_rate / (100 + p_tax_rate), 2) ELSE 0 END;
  ELSE
    v_tax   := round(v_taxable * p_tax_rate / 100, 2);
    v_total := v_taxable + v_tax;
  END IF;

  UPDATE orders SET
    subtotal        = v_subtotal,
    tax_amount      = v_tax,
    discount_amount = v_discount,
    coupon_id       = CASE WHEN p_remove_coupon THEN NULL ELSE coupon_id END,
    coupon_code     = CASE WHEN p_remove_coupon THEN NULL ELSE coupon_code END,
    coupon_notes    = CASE WHEN p_remove_coupon THEN NULL ELSE coupon_notes END,
    coupon_ids      = CASE WHEN p_remove_coupon THEN '[]'::jsonb ELSE coupon_ids END,
    coupon_codes    = CASE WHEN p_remove_coupon THEN '[]'::jsonb ELSE coupon_codes END,
    total           = v_total,
    customer_name   = COALESCE(p_customer_name, customer_name),
    customer_phone  = COALESCE(p_customer_phone, customer_phone),
    notes           = COALESCE(p_notes, notes),
    updated_at      = NOW()
  WHERE id = p_order_id;

  RETURN (SELECT to_jsonb(o.*) FROM orders o WHERE o.id = p_order_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_pending_order(uuid, jsonb, numeric, boolean, text, text, text, numeric, boolean)
  TO authenticated, service_role;


-- ─── create_boutique_order : contrôle du stock + consommation des variantes ──
-- Corps 013, avec : quantité entière > 0, produit du business, consommation
-- de variante lue côté serveur (jamais fournie par le client anonyme),
-- refus STOCK_INSUFFISANT au lieu du plancher à 0, motif « vente » au journal.
CREATE OR REPLACE FUNCTION public.create_boutique_order(order_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business       RECORD;
  v_order_id       UUID;
  v_token          UUID;
  v_item           JSONB;
  v_subtotal       NUMERIC := 0;
  v_payment_method TEXT;
  v_qty            NUMERIC;
  v_pid            UUID;
  v_vid            TEXT;
  v_need           NUMERIC;
  v_stock          NUMERIC;
  v_track          BOOLEAN;
  v_pname          TEXT;
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

  IF order_data->'items' IS NULL OR jsonb_typeof(order_data->'items') <> 'array'
     OR jsonb_array_length(order_data->'items') = 0 THEN
    RAISE EXCEPTION 'Au moins un article est requis';
  END IF;

  -- Calculer le sous-total (+ validation des quantités)
  FOR v_item IN SELECT * FROM jsonb_array_elements(order_data->'items')
  LOOP
    v_qty := (v_item->>'quantity')::NUMERIC;
    IF v_qty IS NULL OR v_qty <= 0 OR v_qty <> trunc(v_qty) THEN
      RAISE EXCEPTION 'QUANTITE_INVALIDE: %', COALESCE(v_item->>'name', '?')
        USING ERRCODE = 'check_violation';
    END IF;
    v_subtotal := v_subtotal + (v_item->>'price')::NUMERIC * v_qty;
  END LOOP;

  v_order_id       := gen_random_uuid();
  v_token          := gen_random_uuid();
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

  PERFORM set_config('app.stock_reason', 'vente', true);
  PERFORM set_config('app.stock_source_id', v_order_id::text, true);

  -- Insérer les articles + décrémenter le stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(order_data->'items')
  LOOP
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_pid := (v_item->>'product_id')::UUID;
    v_vid := NULLIF(v_item->>'variant_id', '');

    SELECT stock, track_stock, name
      INTO v_stock, v_track, v_pname
    FROM products
    WHERE id = v_pid AND business_id = v_business.id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produit introuvable : %', COALESCE(v_item->>'name', '?');
    END IF;

    v_need := v_qty * _variant_stock_consumption(v_pid, v_vid);

    IF COALESCE(v_track, FALSE) AND COALESCE(v_stock, 0) < v_need THEN
      RAISE EXCEPTION 'STOCK_INSUFFISANT: % (reste %, demandé %)',
        COALESCE(v_pname, v_item->>'name'), COALESCE(v_stock, 0), v_need
        USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO order_items (
      id, order_id, product_id, variant_id,
      name, price, quantity, discount_amount, total, stock_qty
    ) VALUES (
      gen_random_uuid(),
      v_order_id,
      v_pid,
      v_vid,
      v_item->>'name',
      (v_item->>'price')::NUMERIC,
      v_qty::INTEGER,
      0,
      (v_item->>'price')::NUMERIC * v_qty,
      v_need
    );

    UPDATE products
    SET stock      = COALESCE(stock, 0) - v_need,
        updated_at = NOW()
    WHERE id = v_pid
      AND track_stock = true;
  END LOOP;

  RETURN jsonb_build_object(
    'id',            v_order_id,
    'payment_token', v_token
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_boutique_order(JSONB) TO anon, authenticated, service_role;
