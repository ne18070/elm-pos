-- ============================================================
-- Migration 008 : RPC complète pour enregistrer le solde d'un acompte
-- ============================================================

CREATE OR REPLACE FUNCTION complete_order_payment(
  p_order_id UUID,
  p_method   TEXT,
  p_amount   NUMERIC
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_order      orders%ROWTYPE;
  v_total_paid NUMERIC;
BEGIN
  -- Verrouiller la commande
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commande introuvable';
  END IF;

  IF v_order.status NOT IN ('pending') THEN
    RAISE EXCEPTION 'Cette commande ne peut plus recevoir de paiement complémentaire (statut : %)', v_order.status;
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Le montant doit être positif';
  END IF;

  -- Insérer le paiement complémentaire
  INSERT INTO payments (order_id, method, amount)
  VALUES (p_order_id, p_method, p_amount);

  -- Calculer le total payé
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM payments WHERE order_id = p_order_id;

  -- Marquer comme payée si solde atteint
  IF v_total_paid >= v_order.total - 0.01 THEN
    UPDATE orders SET status = 'paid', updated_at = NOW() WHERE id = p_order_id;
  END IF;
END;
$$;
