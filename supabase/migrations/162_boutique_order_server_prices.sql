-- ============================================================================
-- Migration 162 : create_boutique_order — prix et libellés lus en base
--
-- La RPC est appelable par anon (boutique web + app « ELM Boutique ») et
-- recopiait `price` et `name` envoyés par le client : n'importe qui pouvait
-- passer commande à 1 FCFA, ou à prix négatif, en appelant la RPC directement.
--
-- Désormais, comme create_public_service_order (159) :
--   prix    = products.price + variants[].price_modifier
--   libellé = « Produit » ou « Produit — Variante » (même format que les clients)
--   produit inactif ou variante inconnue → refus avec un message lisible
--   (affiché tel quel par les deux clients) invitant à rafraîchir.
-- `price` / `name` éventuellement envoyés sont ignorés : les clients existants
-- continuent de fonctionner sans mise à jour.
-- Le reste du corps est celui de 157 (stock, consommation des variantes).
-- ============================================================================

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
  v_qty            NUMERIC;
  v_pid            UUID;
  v_vid            TEXT;
  v_need           NUMERIC;
  v_stock          NUMERIC;
  v_track          BOOLEAN;
  v_pname          TEXT;
  v_base_price     NUMERIC;
  v_variant        JSONB;
  v_price          NUMERIC;
  v_name           TEXT;
  v_lines          JSONB := '[]'::jsonb;
  v_line           JSONB;
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

  -- 1re passe : valider chaque ligne et fixer prix/libellé depuis le catalogue
  FOR v_item IN SELECT * FROM jsonb_array_elements(order_data->'items')
  LOOP
    v_qty := (v_item->>'quantity')::NUMERIC;
    IF v_qty IS NULL OR v_qty <= 0 OR v_qty <> trunc(v_qty) THEN
      RAISE EXCEPTION 'QUANTITE_INVALIDE: %', COALESCE(v_item->>'name', '?')
        USING ERRCODE = 'check_violation';
    END IF;

    v_pid := (v_item->>'product_id')::UUID;
    v_vid := NULLIF(v_item->>'variant_id', '');

    SELECT p.price, p.name,
           CASE WHEN jsonb_typeof(p.variants) = 'array' THEN p.variants ELSE '[]'::jsonb END
      INTO v_base_price, v_pname, v_variant
    FROM products p
    WHERE p.id = v_pid AND p.business_id = v_business.id AND p.is_active;

    IF NOT FOUND THEN
      -- Message affiché tel quel par la boutique web et l'app
      RAISE EXCEPTION 'Un article de votre panier n''est plus disponible. Actualisez la boutique.'
        USING ERRCODE = 'check_violation';
    END IF;

    v_price := COALESCE(v_base_price, 0);
    v_name  := v_pname;

    IF v_vid IS NOT NULL THEN
      SELECT v INTO v_variant
      FROM jsonb_array_elements(v_variant) v
      WHERE v->>'id' = v_vid
      LIMIT 1;

      IF v_variant IS NULL THEN
        RAISE EXCEPTION 'L''option choisie pour « % » n''est plus disponible. Actualisez la boutique.', v_pname
          USING ERRCODE = 'check_violation';
      END IF;

      IF jsonb_typeof(v_variant->'price_modifier') = 'number' THEN
        v_price := v_price + (v_variant->>'price_modifier')::NUMERIC;
      END IF;
      v_name := v_pname || ' — ' || COALESCE(v_variant->>'name', '');
    END IF;

    v_price := GREATEST(v_price, 0);
    v_subtotal := v_subtotal + v_price * v_qty;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id', v_pid, 'variant_id', v_vid, 'quantity', v_qty,
      'price', v_price, 'name', v_name
    ));
  END LOOP;

  v_order_id := gen_random_uuid();
  v_token    := gen_random_uuid();

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

  -- 2e passe : articles + décrément du stock
  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines)
  LOOP
    v_qty := (v_line->>'quantity')::NUMERIC;
    v_pid := (v_line->>'product_id')::UUID;
    v_vid := v_line->>'variant_id';

    SELECT stock, track_stock, name
      INTO v_stock, v_track, v_pname
    FROM products
    WHERE id = v_pid AND business_id = v_business.id
    FOR UPDATE;

    v_need := v_qty * _variant_stock_consumption(v_pid, v_vid);

    IF COALESCE(v_track, FALSE) AND COALESCE(v_stock, 0) < v_need THEN
      RAISE EXCEPTION 'STOCK_INSUFFISANT: % (reste %, demandé %)',
        v_pname, COALESCE(v_stock, 0), v_need
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
      v_line->>'name',
      (v_line->>'price')::NUMERIC,
      v_qty::INTEGER,
      0,
      (v_line->>'price')::NUMERIC * v_qty,
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
