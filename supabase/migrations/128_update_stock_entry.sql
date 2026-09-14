-- ============================================================================
-- Migration 128 : correction d'une entrée de stock existante
--
-- Jusqu'ici un approvisionnement ne pouvait être que créé (add_stock_entry /
-- receive_purchase_order), jamais corrigé après coup — une erreur de saisie
-- (quantité, coût, fournisseur) restait figée dans l'historique. Cette RPC
-- permet de modifier une entrée existante tout en gardant products.stock et
-- products.cost_price cohérents :
--   - l'écart de quantité (nouvelle - ancienne) est répercuté sur le stock ;
--   - cost_price est recalculé à partir du cost_per_unit le plus récent
--     connu pour ce produit (peut changer si l'entrée éditée était, ou
--     devient, la plus récente à coût renseigné).
-- Même politique de rôles que add_stock_entry : owner/admin/manager.
--
-- Passé 24h après la saisie, la quantité est verrouillée (déjà potentiellement
-- vendue, comptée, rapprochée) : seuls coût, fournisseur, conditionnement
-- (libellé) et notes restent modifiables.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_stock_entry(
  p_entry_id       UUID,
  p_quantity       NUMERIC,
  p_packaging_qty  INTEGER DEFAULT NULL,
  p_packaging_size NUMERIC DEFAULT NULL,
  p_packaging_unit TEXT    DEFAULT NULL,
  p_supplier       TEXT    DEFAULT NULL,
  p_cost_per_unit  NUMERIC DEFAULT NULL,
  p_notes          TEXT    DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_role     TEXT;
  v_entry    stock_entries%ROWTYPE;
  v_new_cost NUMERIC;
BEGIN
  -- Verrou de ligne : sérialise les corrections concurrentes de la même entrée.
  SELECT * INTO v_entry FROM stock_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entrée de stock introuvable';
  END IF;

  IF v_uid IS NOT NULL THEN
    SELECT role INTO v_role
    FROM business_members
    WHERE business_id = v_entry.business_id AND user_id = v_uid;

    IF v_role IS NULL THEN
      RAISE EXCEPTION 'ACCES_REFUSE: utilisateur non membre de ce business'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_role NOT IN ('owner', 'admin', 'manager') THEN
      RAISE EXCEPTION 'ACCES_REFUSE: rôle "%" insuffisant pour modifier les stocks', v_role
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

  IF v_entry.created_at < NOW() - INTERVAL '24 hours' AND p_quantity IS DISTINCT FROM v_entry.quantity THEN
    RAISE EXCEPTION 'QUANTITE_VERROUILLEE: la quantité ne peut plus être modifiée passé 24h — seuls le coût, le fournisseur, le conditionnement et les notes restent modifiables'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE stock_entries
  SET quantity       = p_quantity,
      packaging_qty  = p_packaging_qty,
      packaging_size = p_packaging_size,
      packaging_unit = p_packaging_unit,
      supplier       = p_supplier,
      cost_per_unit  = p_cost_per_unit,
      notes          = p_notes
  WHERE id = p_entry_id;

  -- Répercute l'écart de quantité sur le stock produit. Motif distinct de
  -- « approvisionnement » : le journal (StockHistoryModal) doit pouvoir
  -- distinguer une correction rétroactive d'une nouvelle réception.
  PERFORM set_config('app.stock_reason', 'correction_appro', true);
  PERFORM set_config('app.stock_source_id', p_entry_id::text, true);

  UPDATE products
  SET stock      = COALESCE(stock, 0) + (p_quantity - v_entry.quantity),
      updated_at = NOW()
  WHERE id = v_entry.product_id;

  -- Recalcule le dernier coût unitaire connu pour ce produit.
  SELECT cost_per_unit INTO v_new_cost
  FROM stock_entries
  WHERE product_id = v_entry.product_id AND cost_per_unit IS NOT NULL
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  UPDATE products
  SET cost_price = v_new_cost
  WHERE id = v_entry.product_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_stock_entry(
  UUID, NUMERIC, INTEGER, NUMERIC, TEXT, TEXT, NUMERIC, TEXT
) TO authenticated, service_role;
