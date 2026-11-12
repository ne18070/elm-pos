-- ============================================================================
-- Migration 174 : encaisser / annuler / rembourser — l'appelant doit appartenir
-- à l'établissement de la commande
--
-- complete_order_payment, cancel_order et refund_order sont SECURITY DEFINER
-- (contournent la RLS) et ne prenaient qu'un id de commande, sans vérifier à qui
-- elle appartient : n'importe quel compte connecté connaissant l'id d'une
-- commande d'un autre établissement pouvait l'encaisser (la marquer payée),
-- l'annuler (stock restitué, coupons libérés) ou la rembourser. Les id de
-- commande circulent hors de l'établissement (pages publiques de confirmation
-- boutique, liens de suivi, partages WhatsApp). Même faille que create_order,
-- corrigée en 168 — même règle ici, factorisée dans _assert_order_access :
--   - service_role (API v1, déjà authentifiée par clé API) et superadmin passent ;
--   - sinon l'appelant doit être membre (business_members) ou propriétaire de
--     l'établissement de la commande. anon perd l'exécution.
--
-- complete_order_payment — deux corps coexistaient dans l'historique (003 :
-- sans stock ; 051 regroupé dans 002 : décrément du stock WhatsApp au paiement),
-- la version active dépendait de l'ordre d'application. Celle-ci fige le bon
-- comportement : une commande WhatsApp (insérée sans create_order, donc sans
-- décrément) décrémente son stock quand elle est soldée, et enregistre
-- order_items.stock_qty pour qu'une annulation / un remboursement restitue
-- exactement ce qui a été retiré (cf. 157). Les commandes boutique ont déjà été
-- décrémentées par create_boutique_order : rien à faire.
--
-- cancel_order — corps 157 + contrôle d'accès, et une commande WhatsApp encore
-- en attente (stock jamais décrémenté, stock_qty NULL) n'est plus « restituée »
-- à l'annulation : c'était du stock fantôme ajouté à chaque demande annulée.
--
-- refund_order — corps 157 + contrôle d'accès.
--
-- Non concerné : update_pending_order contrôle déjà l'établissement
-- (business_id = get_user_business_id(), l'établissement actif — migration 157).
-- ============================================================================


-- ─── Contrôle d'accès partagé ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._assert_order_access(p_business_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS NOT DISTINCT FROM 'service_role'
     OR COALESCE(public.is_superadmin(), false) THEN
    RETURN;
  END IF;

  IF auth.uid() IS NULL OR NOT (
    EXISTS (SELECT 1 FROM public.business_members bm
             WHERE bm.business_id = p_business_id AND bm.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.businesses b
                WHERE b.id = p_business_id AND b.owner_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'ACCES_REFUSE: vous n''êtes pas membre de cet établissement'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._assert_order_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._assert_order_access(uuid) TO authenticated, service_role;


-- ─── complete_order_payment ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.complete_order_payment(
  p_order_id UUID,
  p_method   TEXT,
  p_amount   NUMERIC
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order      orders%ROWTYPE;
  v_total_paid NUMERIC;
  v_item       order_items%ROWTYPE;
BEGIN
  -- Verrouiller la commande
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commande introuvable';
  END IF;

  PERFORM public._assert_order_access(v_order.business_id);

  IF v_order.status NOT IN ('pending') THEN
    RAISE EXCEPTION 'Cette commande ne peut plus recevoir de paiement complémentaire (statut : %)', v_order.status;
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Le montant doit être positif';
  END IF;

  -- Insérer le paiement complémentaire (orders.amount_paid suit via le trigger
  -- payments_sync_order_amount_paid, migration 112)
  INSERT INTO payments (order_id, method, amount)
  VALUES (p_order_id, p_method, p_amount);

  -- Calculer le total payé
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM payments WHERE order_id = p_order_id;

  -- Marquer comme payée si solde atteint
  IF v_total_paid >= v_order.total - 0.01 THEN
    UPDATE orders SET status = 'paid', updated_at = NOW() WHERE id = p_order_id;

    -- Commandes WhatsApp : stock décrémenté au paiement (les autres l'ont été à
    -- la création). stock_qty NULL = pas encore décrémenté → idempotent.
    IF v_order.source = 'whatsapp' THEN
      FOR v_item IN
        SELECT * FROM order_items
        WHERE order_id = p_order_id AND stock_qty IS NULL AND product_id IS NOT NULL
      LOOP
        PERFORM public.decrement_stock(v_item.product_id, v_item.quantity, p_order_id);
        UPDATE order_items SET stock_qty = v_item.quantity WHERE id = v_item.id;
      END LOOP;
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_order_payment(uuid, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_order_payment(uuid, text, numeric) TO authenticated, service_role;


-- ─── cancel_order (corps 157 + contrôle d'accès) ────────────────────────────
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

  PERFORM public._assert_order_access(v_order.business_id);

  IF v_order.status NOT IN ('paid', 'pending') THEN
    RAISE EXCEPTION 'Impossible d''annuler une commande avec le statut : %', v_order.status;
  END IF;

  PERFORM set_config('app.stock_reason', 'annulation', true);
  PERFORM set_config('app.stock_source_id', p_order_id::text, true);

  FOR v_item IN
    SELECT * FROM order_items WHERE order_id = p_order_id
  LOOP
    -- Demande WhatsApp jamais soldée : son stock n'a jamais été décrémenté.
    CONTINUE WHEN v_order.source = 'whatsapp' AND v_order.status = 'pending' AND v_item.stock_qty IS NULL;

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

REVOKE ALL ON FUNCTION public.cancel_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_order(uuid) TO authenticated, service_role;


-- ─── refund_order (corps 157 + contrôle d'accès) ────────────────────────────
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

  PERFORM public._assert_order_access(v_order.business_id);

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

REVOKE ALL ON FUNCTION public.refund_order(uuid, numeric, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refund_order(uuid, numeric, text, uuid) TO authenticated, service_role;
