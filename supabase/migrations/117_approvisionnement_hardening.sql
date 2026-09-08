-- ============================================================================
-- Migration 117 : fiabilisation du module Approvisionnements
--
--   A1. Réception d'un bon de commande NON atomique et re-jouable :
--       receivePurchaseOrder() bouclait côté client sur addStockEntry() puis
--       passait le statut à 'received' à la fin. Double-clic / rejeu / échec
--       partiel => stock ajouté deux fois ou réception incohérente. On crée
--       une RPC serveur unique receive_purchase_order() : verrou de ligne,
--       contrôle du statut ('ordered' uniquement), création des entrées de
--       stock + incrément du stock + passage en 'received', le tout dans une
--       seule transaction.
--
--   A2. Aucune contrainte de transition de statut : un BC 'received' pouvait
--       repasser 'draft' via l'API. Trigger de garde sur purchase_orders.
--
--   A3. add_stock_entry() (SECURITY DEFINER) ne vérifiait pas que l'appelant
--       est membre du business ciblé ni son rôle, et acceptait un p_created_by
--       arbitraire. On contrôle l'appartenance + le rôle (owner/admin/manager)
--       et on force created_by = auth.uid() quand il n'est pas fourni.
--
--   A4. record_stock_adjustment() valorisait au COÛT MOYEN SIMPLE
--       (AVG(cost_per_unit)) — faux dès que les quantités diffèrent. On passe
--       à la MOYENNE PONDÉRÉE PAR LES QUANTITÉS (CUMP).
--
--   A5. Garde-fous de données : cost_per_unit >= 0 (stock_entries),
--       quantity_ordered > 0 et quantity_received >= 0 (purchase_order_items).
-- ============================================================================


-- ─── A5. Contraintes de validation ────────────────────────────────────────
-- NOT VALID : on protège les écritures futures sans échouer sur d'éventuelles
-- lignes héritées non conformes.
ALTER TABLE public.stock_entries
  DROP CONSTRAINT IF EXISTS chk_stock_entries_cost_nonneg;
ALTER TABLE public.stock_entries
  ADD CONSTRAINT chk_stock_entries_cost_nonneg
  CHECK (cost_per_unit IS NULL OR cost_per_unit >= 0) NOT VALID;

ALTER TABLE public.purchase_order_items
  DROP CONSTRAINT IF EXISTS chk_poi_qty_ordered_pos;
ALTER TABLE public.purchase_order_items
  ADD CONSTRAINT chk_poi_qty_ordered_pos
  CHECK (quantity_ordered > 0) NOT VALID;

ALTER TABLE public.purchase_order_items
  DROP CONSTRAINT IF EXISTS chk_poi_qty_received_nonneg;
ALTER TABLE public.purchase_order_items
  ADD CONSTRAINT chk_poi_qty_received_nonneg
  CHECK (quantity_received IS NULL OR quantity_received >= 0) NOT VALID;


-- ─── A3. add_stock_entry : contrôle d'appartenance + rôle ─────────────────
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
BEGIN
  -- Contexte utilisateur (auth.uid() NULL => appel service_role de confiance).
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

  -- Le produit doit appartenir au business.
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
  );

  UPDATE products
  SET stock      = COALESCE(stock, 0) + p_quantity,
      updated_at = NOW()
  WHERE id = p_product_id;
END;
$$;


-- ─── A4. record_stock_adjustment : CUMP (moyenne pondérée) ────────────────
CREATE OR REPLACE FUNCTION public.record_stock_adjustment(
  p_product_id uuid,
  p_qty_before numeric,
  p_qty_after  numeric,
  p_reason     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_biz     uuid := get_user_business_id();
  v_prod    products%ROWTYPE;
  v_delta   numeric;
  v_avgcost numeric;
  v_value   numeric;
  v_entry   uuid;
BEGIN
  SELECT * INTO v_prod FROM products WHERE id = p_product_id;
  IF NOT FOUND OR v_prod.business_id IS DISTINCT FROM v_biz THEN
    RAISE EXCEPTION 'Produit introuvable';
  END IF;

  v_delta := COALESCE(p_qty_after, 0) - COALESCE(p_qty_before, 0);
  IF round(v_delta, 3) = 0 THEN
    RETURN jsonb_build_object('skipped', 'no_change');
  END IF;

  -- Coût unitaire moyen pondéré par les quantités (CUMP), et non moyenne simple.
  SELECT SUM(quantity * cost_per_unit) / NULLIF(SUM(quantity), 0)
    INTO v_avgcost
  FROM stock_entries
  WHERE product_id = p_product_id
    AND cost_per_unit IS NOT NULL AND cost_per_unit > 0
    AND quantity > 0;

  v_value := round(ABS(v_delta) * COALESCE(v_avgcost, 0), 2);
  IF v_value <= 0 THEN
    RETURN jsonb_build_object('skipped', 'no_cost');
  END IF;

  INSERT INTO public.journal_entries
    (business_id, entry_date, reference, description, source, source_id)
  VALUES (
    v_biz, CURRENT_DATE, 'AJ-STOCK',
    format('Ajustement stock — %s : %s → %s%s',
      v_prod.name, p_qty_before, p_qty_after,
      CASE WHEN COALESCE(p_reason, '') <> '' THEN ' (' || p_reason || ')' ELSE '' END),
    'adjustment', gen_random_uuid()
  )
  RETURNING id INTO v_entry;

  IF v_delta > 0 THEN
    INSERT INTO public.journal_lines (entry_id, account_code, account_name, debit, credit) VALUES
      (v_entry, '31',  'Marchandises',                          v_value, 0),
      (v_entry, '603', 'Variations des stocks de marchandises', 0,       v_value);
  ELSE
    INSERT INTO public.journal_lines (entry_id, account_code, account_name, debit, credit) VALUES
      (v_entry, '603', 'Variations des stocks de marchandises', v_value, 0),
      (v_entry, '31',  'Marchandises',                          0,       v_value);
  END IF;

  RETURN jsonb_build_object('entry_id', v_entry, 'value', v_value, 'delta', v_delta);
END;
$$;


-- ─── A2. Garde de transition de statut sur purchase_orders ────────────────
CREATE OR REPLACE FUNCTION public.enforce_po_status_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'draft'   AND NEW.status IN ('ordered', 'cancelled')) OR
      (OLD.status = 'ordered' AND NEW.status IN ('received', 'cancelled'))
    ) THEN
      RAISE EXCEPTION 'TRANSITION_INVALIDE: bon de commande % → %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_po_status_transition ON public.purchase_orders;
CREATE TRIGGER trg_po_status_transition
  BEFORE UPDATE OF status ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_po_status_transition();


-- ─── A1. Réception atomique d'un bon de commande ─────────────────────────
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
  -- Verrou de ligne : sérialise les réceptions concurrentes du même BC.
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

  FOR v_item IN
    SELECT * FROM purchase_order_items WHERE order_id = p_order_id
  LOOP
    v_qty := COALESCE(v_item.quantity_received, v_item.quantity_ordered);
    CONTINUE WHEN v_qty IS NULL OR v_qty <= 0;

    -- Défensif : le produit doit appartenir au même business.
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


-- ─── Droits ──────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(uuid)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_po_status_transition()      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION add_stock_entry(UUID, UUID, NUMERIC, INTEGER, NUMERIC, TEXT, TEXT, NUMERIC, TEXT, UUID)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_stock_adjustment(uuid, numeric, numeric, text)
  TO authenticated, service_role;
