-- ============================================================
-- ELM APP — Annulation et remboursement transactionnels
-- À exécuter dans : Supabase Dashboard > SQL Editor
-- ============================================================

-- Table de traçabilité des remboursements
CREATE TABLE IF NOT EXISTS refunds (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount       NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  reason       TEXT,
  refunded_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  refunded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds(order_id);

ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "refunds_select" ON refunds FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = refunds.order_id
      AND o.business_id = get_user_business_id()
  ));

CREATE POLICY "refunds_insert" ON refunds FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = refunds.order_id
      AND o.business_id = get_user_business_id()
      AND get_user_role() IN ('admin', 'owner')
  ));

-- ─── Annulation transactionnelle ─────────────────────────────────────────────
-- Restaure le stock ET décrémente le coupon EN UNE SEULE TRANSACTION

CREATE OR REPLACE FUNCTION cancel_order(p_order_id UUID)
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

  -- Restaurer le stock pour chaque article
  FOR v_item IN
    SELECT * FROM order_items WHERE order_id = p_order_id
  LOOP
    UPDATE products
    SET stock      = stock + v_item.quantity,
        updated_at = NOW()
    WHERE id = v_item.product_id
      AND track_stock = true;
  END LOOP;

  -- Décrémenter le compteur coupon si appliqué
  IF v_order.coupon_id IS NOT NULL THEN
    UPDATE coupons
    SET uses_count = GREATEST(0, uses_count - 1)
    WHERE id = v_order.coupon_id;
  END IF;

  -- Marquer comme annulée
  UPDATE orders
  SET status     = 'cancelled',
      updated_at = NOW()
  WHERE id = p_order_id;
END;
$$;

-- ─── Remboursement transactionnel ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION refund_order(
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

  -- Remboursement TOTAL → restaurer le stock et le coupon
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

    IF v_order.coupon_id IS NOT NULL THEN
      UPDATE coupons
      SET uses_count = GREATEST(0, uses_count - 1)
      WHERE id = v_order.coupon_id;
    END IF;
  END IF;
  -- Remboursement PARTIEL → pas de restauration de stock (produits conservés)

  -- Enregistrer dans la table refunds
  INSERT INTO refunds (order_id, amount, reason, refunded_by)
  VALUES (p_order_id, p_amount, p_reason, p_refunded_by);

  -- Mettre à jour le statut de la commande
  UPDATE orders
  SET status     = 'refunded',
      updated_at = NOW()
  WHERE id = p_order_id;
END;
$$;
