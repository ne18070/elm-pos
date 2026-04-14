-- ============================================================
-- ELM APP — Système de vérification livraison / picking
-- À exécuter dans : Supabase Dashboard > SQL Editor
-- ============================================================

-- Statut de livraison sur la commande
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'picking', 'delivered')),
  ADD COLUMN IF NOT EXISTS delivered_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivered_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_delivery ON orders(business_id, delivery_status)
  WHERE status = 'paid';

-- Fonction : démarrer le picking
CREATE OR REPLACE FUNCTION start_order_picking(p_order_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  UPDATE orders
  SET delivery_status = 'picking',
      updated_at      = NOW()
  WHERE id = p_order_id
    AND status = 'paid'
    AND delivery_status = 'pending';
END;
$$;

-- Fonction : valider la livraison
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
    AND status = 'paid'
    AND delivery_status IN ('pending', 'picking');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commande introuvable ou déjà livrée';
  END IF;
END;
$$;
