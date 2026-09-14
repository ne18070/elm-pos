-- ============================================================================
-- Migration 129 : restaure le motif « approvisionnement » dans le journal
--
-- Régression introduite par la migration 126 : en réécrivant add_stock_entry
-- pour reporter cost_per_unit sur products.cost_price, l'appel
-- set_config('app.stock_reason', 'approvisionnement', true) — ajouté par la
-- migration 121 — a été perdu. Depuis, tout approvisionnement manuel retombe
-- sur le motif par défaut du trigger (« ajustement ») et s'affiche comme
-- « Ajustement manuel » dans StockHistoryModal au lieu de
-- « Approvisionnement ».
--
-- receive_purchase_order n'a lui jamais eu ce tag (jamais mis à jour après la
-- 121) : on le corrige à la même occasion, avec source_id = commande, comme
-- le fait déjà cancel_order/refund_order pour leurs propres motifs.
-- ============================================================================

CREATE OR REPLACE FUNCTION add_stock_entry(
  p_business_id   UUID,
  p_product_id    UUID,
  p_quantity      NUMERIC,
  p_packaging_qty  INTEGER  DEFAULT NULL,
  p_packaging_size NUMERIC  DEFAULT NULL,
  p_packaging_unit TEXT     DEFAULT NULL,
  p_supplier      TEXT     DEFAULT NULL,
  p_cost_per_unit NUMERIC  DEFAULT NULL,
  p_notes         TEXT     DEFAULT NULL,
  p_created_by    UUID     DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_role TEXT;
  v_entry_id UUID;
BEGIN
  IF v_uid IS NOT NULL THEN
    SELECT role INTO v_role
    FROM business_members
    WHERE business_id = p_business_id AND user_id = v_uid;

    IF v_role IS NULL THEN
      RAISE EXCEPTION 'ACCES_REFUSE: utilisateur non membre de ce business'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_role NOT IN ('owner', 'admin', 'manager') THEN
      RAISE EXCEPTION 'ACCES_REFUSE: rôle "%" insuffisant pour gérer les stocks', v_role
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF COALESCE(p_quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'QUANTITE_INVALIDE: la quantité doit être strictement positive'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_cost_per_unit IS NOT NULL AND p_cost_per_unit < 0 THEN
    RAISE EXCEPTION 'COUT_INVALIDE: le coût unitaire ne peut pas être négatif'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM products WHERE id = p_product_id AND business_id = p_business_id
  ) THEN
    RAISE EXCEPTION 'Produit introuvable';
  END IF;

  INSERT INTO stock_entries (
    business_id, product_id, quantity,
    packaging_qty, packaging_size, packaging_unit,
    supplier, cost_per_unit, notes, created_by
  )
  VALUES (
    p_business_id, p_product_id, p_quantity,
    p_packaging_qty, p_packaging_size, p_packaging_unit,
    p_supplier, p_cost_per_unit, p_notes, COALESCE(p_created_by, v_uid)
  )
  RETURNING id INTO v_entry_id;

  PERFORM set_config('app.stock_reason', 'approvisionnement', true);
  PERFORM set_config('app.stock_source_id', v_entry_id::text, true);

  UPDATE products
  SET stock      = COALESCE(stock, 0) + p_quantity,
      cost_price = COALESCE(p_cost_per_unit, cost_price),
      updated_at = NOW()
  WHERE id = p_product_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.receive_purchase_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_po       purchase_orders%ROWTYPE;
  v_role     text;
  v_supplier text;
  v_item     record;
  v_qty      numeric;
  v_lines    integer := 0;
BEGIN
  SELECT * INTO v_po FROM purchase_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bon de commande introuvable';
  END IF;

  IF v_uid IS NOT NULL THEN
    SELECT role INTO v_role
    FROM business_members
    WHERE business_id = v_po.business_id AND user_id = v_uid;

    IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'manager') THEN
      RAISE EXCEPTION 'ACCES_REFUSE: permission insuffisante pour réceptionner'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF v_po.status <> 'ordered' THEN
    RAISE EXCEPTION 'STATUT_INVALIDE: seule une commande « Commandé » peut être réceptionnée (statut actuel : %)', v_po.status
      USING ERRCODE = 'check_violation';
  END IF;

  v_supplier := NULLIF(v_po.supplier_name, '');
  IF v_supplier IS NULL AND v_po.supplier_id IS NOT NULL THEN
    SELECT name INTO v_supplier FROM suppliers WHERE id = v_po.supplier_id;
  END IF;

  PERFORM set_config('app.stock_reason', 'approvisionnement', true);
  PERFORM set_config('app.stock_source_id', p_order_id::text, true);

  FOR v_item IN
    SELECT * FROM purchase_order_items WHERE order_id = p_order_id
  LOOP
    v_qty := COALESCE(v_item.quantity_received, v_item.quantity_ordered);
    CONTINUE WHEN v_qty IS NULL OR v_qty <= 0;

    IF NOT EXISTS (
      SELECT 1 FROM products
      WHERE id = v_item.product_id AND business_id = v_po.business_id
    ) THEN
      RAISE EXCEPTION 'Produit % hors business', v_item.product_id;
    END IF;

    INSERT INTO stock_entries (
      business_id, product_id, quantity,
      packaging_qty, packaging_size, packaging_unit,
      supplier, cost_per_unit, notes, created_by
    )
    VALUES (
      v_po.business_id, v_item.product_id, v_qty,
      v_item.packaging_qty, v_item.packaging_size, v_item.packaging_unit,
      v_supplier, v_item.cost_per_unit,
      CASE WHEN COALESCE(v_po.reference, '') <> '' THEN 'BC ' || v_po.reference END,
      v_uid
    );

    UPDATE products
    SET stock      = COALESCE(stock, 0) + v_qty,
        cost_price = COALESCE(v_item.cost_per_unit, cost_price),
        updated_at = NOW()
    WHERE id = v_item.product_id;

    v_lines := v_lines + 1;
  END LOOP;

  UPDATE purchase_orders
  SET status = 'received', received_at = NOW()
  WHERE id = p_order_id;

  INSERT INTO activity_logs (business_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_po.business_id, v_uid, 'po.received', 'purchase_order', p_order_id::text,
    jsonb_build_object('reference', v_po.reference, 'lines', v_lines)
  );

  RETURN jsonb_build_object('order_id', p_order_id, 'lines', v_lines);
END;
$$;
