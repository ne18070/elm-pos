-- ============================================================
-- Migration 015 : Correction livraison pour commandes acompte
-- Les commandes avec acompte ont status='pending' mais doivent
-- pouvoir être livrées (start_order_picking + confirm_order_delivery).
-- ============================================================

-- Correction de l'index (inclut aussi les commandes pending)
DROP INDEX IF EXISTS idx_orders_delivery;
CREATE INDEX IF NOT EXISTS idx_orders_delivery
  ON orders(business_id, delivery_status)
  WHERE status IN ('paid', 'pending');

-- Correction : start_order_picking accepte paid ET pending
CREATE OR REPLACE FUNCTION start_order_picking(p_order_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  UPDATE orders
  SET delivery_status = 'picking',
      updated_at      = NOW()
  WHERE id = p_order_id
    AND status IN ('paid', 'pending')
    AND delivery_status = 'pending';
END;
$$;

-- Correction : confirm_order_delivery accepte paid ET pending
CREATE OR REPLACE FUNCTION confirm_order_delivery(
  p_order_id     UUID,
  p_delivered_by UUID
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  UPDATE orders
  SET delivery_status = 'delivered',
      delivered_by    = p_delivered_by,
      delivered_at    = NOW(),
      updated_at      = NOW()
  WHERE id = p_order_id
    AND status IN ('paid', 'pending')
    AND delivery_status IN ('pending', 'picking');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commande introuvable ou déjà livrée';
  END IF;
END;
$$;
