-- Migration 107 : édition d'une commande NON encaissée
--
-- Une commande status='pending' sans aucun paiement (somme payments = 0) n'a
-- touché ni la caisse ni la compta — seul le stock a été décrémenté à la
-- création. On autorise donc sa modification : on restaure le stock des
-- anciennes lignes, on remplace order_items, on re-décrémente le stock, on
-- recalcule sous-total / TVA / total (la remise éventuelle est conservée).
-- Le tout en une transaction. Interdit dès qu'un paiement existe.

CREATE OR REPLACE FUNCTION public.update_pending_order(
  p_order_id       uuid,
  p_items          jsonb,       -- [{product_id, variant_id?, name, price, quantity, notes?}]
  p_tax_rate       numeric DEFAULT 0,
  p_tax_inclusive  boolean DEFAULT false,
  p_customer_name  text    DEFAULT NULL,
  p_customer_phone text    DEFAULT NULL,
  p_notes          text    DEFAULT NULL
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

  -- 3. Recalcul (remise existante conservée)
  v_taxable := v_subtotal - COALESCE(v_order.discount_amount, 0);
  IF p_tax_inclusive THEN
    v_total := v_taxable;
    v_tax   := CASE WHEN p_tax_rate > 0 THEN round(v_taxable * p_tax_rate / (100 + p_tax_rate), 2) ELSE 0 END;
  ELSE
    v_tax   := round(v_taxable * p_tax_rate / 100, 2);
    v_total := v_taxable + v_tax;
  END IF;

  UPDATE orders SET
    subtotal       = v_subtotal,
    tax_amount     = v_tax,
    total          = v_total,
    customer_name  = COALESCE(p_customer_name, customer_name),
    customer_phone = COALESCE(p_customer_phone, customer_phone),
    notes          = COALESCE(p_notes, notes),
    updated_at     = NOW()
  WHERE id = p_order_id;

  RETURN (SELECT to_jsonb(o.*) FROM orders o WHERE o.id = p_order_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_pending_order(uuid, jsonb, numeric, boolean, text, text, text)
  TO authenticated, service_role;
