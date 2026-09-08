-- ============================================================================
-- Migration 119 : fiabilisation & sécurité du module Coupons
--
--   C1. create_order n'a JAMAIS revalidé les coupons : un code expiré /
--       désactivé / épuisé / d'un autre business passait si le client
--       l'envoyait, et discount_amount était écrit tel quel (montant
--       fabriqué possible). On valide et on verrouille chaque coupon dans
--       create_order + on borne discount_amount à [0, sous-total].
--
--   C2/M7. increment_coupon_uses(uuid) : SECURITY DEFINER sans contrôle de
--       tenant ni de plafond → n'importe quel utilisateur pouvait gonfler le
--       compteur d'un coupon de n'importe quel business. On ajoute un
--       paramètre business + le contrôle max_uses sous verrou.
--
--   M1. validate_coupon(code, business_id, ...) faisait confiance au
--       business_id fourni par l'appelant (fuite inter-tenant). On résout
--       désormais via get_user_business_id() (fallback = paramètre, pour les
--       appels anon de la boutique) et on vérifie enfin min_quantity.
--
--   H2. coupons.code n'était normalisé qu'à la création (pas à l'édition) →
--       un code stocké en minuscule/avec espace ne matchait plus jamais
--       validate_coupon. Trigger de normalisation + backfill.
--
--   H4. cancel_order / refund_order / update_pending_order ne restauraient
--       que le PREMIER coupon (coupon_id) — les coupons empilés (coupon_ids[])
--       gardaient un uses_count gonflé après annulation. Helper de restitution
--       qui parcourt coupon_ids.
--
--   L5. Aucune borne haute sur un coupon percentage en base (l'UI seule
--       limitait à 100). Contrainte CHECK.
-- ============================================================================


-- ─── H2. Normalisation du code coupon (INSERT + UPDATE) ──────────────────────

CREATE OR REPLACE FUNCTION public._normalize_coupon_code()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.code := upper(btrim(NEW.code));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_coupon_code ON public.coupons;
CREATE TRIGGER trg_normalize_coupon_code
  BEFORE INSERT OR UPDATE OF code ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public._normalize_coupon_code();

-- Backfill : on ignore les lignes qui entreraient en collision avec
-- UNIQUE(business_id, code) après normalisation.
DO $$
DECLARE v_fixed INTEGER;
BEGIN
  UPDATE public.coupons c
  SET code = upper(btrim(c.code))
  WHERE c.code <> upper(btrim(c.code))
    AND NOT EXISTS (
      SELECT 1 FROM public.coupons c2
      WHERE c2.business_id = c.business_id
        AND c2.id <> c.id
        AND c2.code = upper(btrim(c.code))
    );
  GET DIAGNOSTICS v_fixed = ROW_COUNT;
  IF v_fixed > 0 THEN
    RAISE NOTICE 'Migration 119 : % code(s) coupon normalisé(s).', v_fixed;
  END IF;
END $$;


-- ─── L5. Borne haute sur les coupons percentage ─────────────────────────────

ALTER TABLE public.coupons DROP CONSTRAINT IF EXISTS coupons_percentage_max;
ALTER TABLE public.coupons ADD CONSTRAINT coupons_percentage_max
  CHECK (type <> 'percentage' OR value <= 100) NOT VALID;


-- ─── C2 / M7. increment_coupon_uses : tenant + plafond sous verrou ──────────
-- Le 2e paramètre est optionnel : les anciens appels à un seul argument
-- continuent de fonctionner (avec, en prime, le contrôle de plafond).

CREATE OR REPLACE FUNCTION public.increment_coupon_uses(
  p_coupon_id   uuid,
  p_business_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_biz  uuid;
  v_max  integer;
  v_used integer;
BEGIN
  SELECT business_id, max_uses, uses_count
    INTO v_biz, v_max, v_used
  FROM coupons
  WHERE id = p_coupon_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN; -- coupon supprimé entre-temps : rien à faire
  END IF;

  IF p_business_id IS NOT NULL AND v_biz IS DISTINCT FROM p_business_id THEN
    RAISE EXCEPTION 'COUPON_HORS_BUSINESS: %', p_coupon_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_max IS NOT NULL AND v_used >= v_max THEN
    RAISE EXCEPTION 'COUPON_EPUISE: %', p_coupon_id
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE coupons SET uses_count = uses_count + 1 WHERE id = p_coupon_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_coupon_uses(uuid, uuid) TO authenticated, service_role;


-- ─── H4. Helper : restituer le compteur de TOUS les coupons d'une commande ──

CREATE OR REPLACE FUNCTION public._release_order_coupons(
  p_coupon_id  uuid,
  p_coupon_ids jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cid uuid;
BEGIN
  IF p_coupon_ids IS NOT NULL
     AND jsonb_typeof(p_coupon_ids) = 'array'
     AND jsonb_array_length(p_coupon_ids) > 0 THEN
    FOR v_cid IN
      SELECT (value #>> '{}')::uuid FROM jsonb_array_elements(p_coupon_ids)
    LOOP
      UPDATE coupons SET uses_count = GREATEST(0, uses_count - 1) WHERE id = v_cid;
    END LOOP;
  ELSIF p_coupon_id IS NOT NULL THEN
    UPDATE coupons SET uses_count = GREATEST(0, uses_count - 1) WHERE id = p_coupon_id;
  END IF;
END;
$$;


-- ─── M1. validate_coupon : tenant résolu serveur + contrôle min_quantity ────

DROP FUNCTION IF EXISTS public.validate_coupon(text, uuid, numeric, uuid);

CREATE OR REPLACE FUNCTION public.validate_coupon(
  coupon_code     text,
  business_id      uuid,
  order_total      numeric,
  user_id          uuid,
  cart_item_count  integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_biz    uuid := COALESCE(get_user_business_id(), business_id);
  v_coupon coupons%ROWTYPE;
  v_count  integer;
BEGIN
  SELECT * INTO v_coupon
  FROM coupons c
  WHERE c.business_id = v_biz
    AND upper(btrim(c.code)) = upper(btrim(coupon_code));

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

  IF v_coupon.min_quantity IS NOT NULL
     AND cart_item_count IS NOT NULL
     AND cart_item_count < v_coupon.min_quantity THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'Quantité minimum : ' || v_coupon.min_quantity || ' article(s)'
    );
  END IF;

  IF v_coupon.per_user_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count
    FROM orders
    WHERE cashier_id = user_id
      AND coupon_id = v_coupon.id
      AND status IN ('paid', 'pending');

    IF v_count >= v_coupon.per_user_limit THEN
      RETURN jsonb_build_object('valid', false, 'error', 'Déjà utilisé par cet utilisateur');
    END IF;
  END IF;

  RETURN jsonb_build_object('valid', true, 'coupon', to_jsonb(v_coupon));
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_coupon(text, uuid, numeric, uuid, integer)
  TO authenticated, anon, service_role;


-- ─── H4. cancel_order : restituer tous les coupons ─────────────────────────

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

  FOR v_item IN
    SELECT * FROM order_items WHERE order_id = p_order_id
  LOOP
    UPDATE products
    SET stock      = stock + v_item.quantity,
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


-- ─── H4. refund_order : restituer tous les coupons (remboursement total) ────

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
    FOR v_item IN
      SELECT * FROM order_items WHERE order_id = p_order_id
    LOOP
      UPDATE products
      SET stock      = stock + v_item.quantity,
          updated_at = NOW()
      WHERE id = v_item.product_id
        AND track_stock = true;
    END LOOP;

    PERFORM _release_order_coupons(v_order.coupon_id, v_order.coupon_ids);
  END IF;
  -- Remboursement PARTIEL → pas de restauration de stock/coupon

  INSERT INTO refunds (order_id, amount, reason, refunded_by)
  VALUES (p_order_id, p_amount, p_reason, p_refunded_by);

  UPDATE orders
  SET status     = 'refunded',
      updated_at = NOW()
  WHERE id = p_order_id;
END;
$$;


-- ─── H4. update_pending_order : restituer tous les coupons au détachement ──

DROP FUNCTION IF EXISTS public.update_pending_order(uuid, jsonb, numeric, boolean, text, text, text, numeric, boolean);

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
  v_paid     numeric;
  v_qty      numeric;
  v_price    numeric;
  v_pid      uuid;
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

  FOR v_item IN SELECT * FROM order_items WHERE order_id = p_order_id LOOP
    UPDATE products
    SET stock = stock + v_item.quantity, updated_at = NOW()
    WHERE id = v_item.product_id AND track_stock = true;
  END LOOP;

  DELETE FROM order_items WHERE order_id = p_order_id;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty   := COALESCE((v_row->>'quantity')::numeric, 0);
    v_price := COALESCE((v_row->>'price')::numeric, 0);
    v_pid   := (v_row->>'product_id')::uuid;
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantité invalide pour « % »', COALESCE(v_row->>'name', '?');
    END IF;

    SELECT stock, track_stock INTO v_stock, v_track
    FROM products WHERE id = v_pid FOR UPDATE;

    IF COALESCE(v_track, false) AND COALESCE(v_stock, 0) < v_qty THEN
      RAISE EXCEPTION 'Stock insuffisant pour « % » : % en stock, % demandé(s)',
        COALESCE(v_row->>'name', '?'), COALESCE(v_stock, 0), v_qty;
    END IF;

    INSERT INTO order_items
      (order_id, product_id, variant_id, name, price, quantity, discount_amount, total, notes)
    VALUES (
      p_order_id,
      v_pid,
      NULLIF(v_row->>'variant_id', '')::uuid,
      COALESCE(v_row->>'name', ''),
      v_price,
      v_qty,
      0,
      v_price * v_qty,
      v_row->>'notes'
    );

    UPDATE products
    SET stock = stock - v_qty, updated_at = NOW()
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

  -- H4 — détacher le coupon : restituer le compteur de TOUS les coupons.
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


-- ─── C1. create_order : validation + verrou des coupons, borne discount ────
-- Corps identique à la migration 116, avec :
--   • borne de discount_amount à [0, sous-total] ;
--   • boucle coupons remplacée par une validation complète sous FOR UPDATE
--     (business, is_active, expiration, plafond, min commande, min quantité)
--     avant l'incrément du compteur.

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

GRANT EXECUTE ON FUNCTION public.create_order(JSONB) TO authenticated, service_role;
