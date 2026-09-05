-- Migration 109 : remise/coupon modifiable ou supprimable sur une commande
-- non encaissée
--
-- update_pending_order (migration 107) permet déjà de modifier les articles
-- d'une commande status='pending' sans aucun paiement, mais conservait
-- toujours la remise (orders.discount_amount) et le coupon appliqué tels
-- quels — impossible de corriger un code promo mal saisi ou d'ajuster/
-- retirer une remise après coup depuis la page Commandes.
--
-- Deux nouveaux paramètres optionnels :
--   p_discount_amount : remplace la remise si fourni (NULL = inchangée,
--                       pour ne pas casser les appels existants qui ne le
--                       passent pas).
--   p_remove_coupon   : détache le coupon de la commande (coupon_id,
--                       coupon_code, coupon_notes, coupon_ids, coupon_codes
--                       réinitialisés) et libère son compteur d'utilisation
--                       (uses_count) — même principe que cancel_order
--                       (migration 003).

DROP FUNCTION IF EXISTS public.update_pending_order(uuid, jsonb, numeric, boolean, text, text, text);

CREATE OR REPLACE FUNCTION public.update_pending_order(
  p_order_id        uuid,
  p_items           jsonb,       -- [{product_id, variant_id?, name, price, quantity, notes?}]
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

  -- 1. Restaurer le stock des anciennes lignes
  FOR v_item IN SELECT * FROM order_items WHERE order_id = p_order_id LOOP
    UPDATE products
    SET stock = stock + v_item.quantity, updated_at = NOW()
    WHERE id = v_item.product_id AND track_stock = true;
  END LOOP;

  DELETE FROM order_items WHERE order_id = p_order_id;

  -- 2. Nouvelles lignes : contrôle du stock DISPONIBLE (après restauration
  --    ci-dessus, products.stock reflète déjà la libération des anciennes
  --    lignes) puis décrément.
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

  -- 3. Remise : remplacée si fournie (y compris 0 pour la retirer), sinon
  --    conservée telle quelle.
  v_discount := COALESCE(p_discount_amount, v_order.discount_amount, 0);
  IF v_discount < 0 THEN
    RAISE EXCEPTION 'La remise ne peut pas être négative';
  END IF;
  IF v_discount > v_subtotal THEN
    RAISE EXCEPTION 'La remise (%) dépasse le sous-total (%)', v_discount, v_subtotal;
  END IF;

  -- 4. Détacher le coupon si demandé — libère son compteur d'utilisation
  --    (même principe que cancel_order, migration 003) avant de réinitialiser
  --    les colonnes coupon_* de la commande ci-dessous.
  IF p_remove_coupon AND v_order.coupon_id IS NOT NULL THEN
    UPDATE coupons SET uses_count = GREATEST(0, uses_count - 1) WHERE id = v_order.coupon_id;
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
