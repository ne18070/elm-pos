-- Migration 108 : écriture comptable sur ajustement manuel de stock
--
-- Un changement manuel de la quantité en stock d'un produit (fiche produit)
-- n'était tracé nulle part en comptabilité. On crée désormais une écriture
-- 'Ajustement stock' valorisée au COÛT D'ACHAT MOYEN du produit (moyenne des
-- cost_per_unit de ses approvisionnements) :
--   hausse du stock : Débit 31 Marchandises / Crédit 603 Variations des stocks
--   baisse du stock : Débit 603 / Crédit 31
-- Sans coût d'achat connu (aucun approvisionnement), aucune écriture.

INSERT INTO public.accounts (business_id, code, name, class, nature, balance_type, is_default, is_active)
SELECT NULL, '603', 'Variations des stocks de marchandises', 6, 'charge', 'debit', TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '603' AND business_id IS NULL);

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

  SELECT AVG(cost_per_unit) INTO v_avgcost
  FROM stock_entries
  WHERE product_id = p_product_id AND cost_per_unit IS NOT NULL AND cost_per_unit > 0;

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

GRANT EXECUTE ON FUNCTION public.record_stock_adjustment(uuid, numeric, numeric, text)
  TO authenticated, service_role;
