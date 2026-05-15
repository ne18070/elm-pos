-- Migration 087 : Robustesse des ordres de service
-- 1. pay_service_order       — paiement atomique (UPDATE + INSERT dans une transaction)
-- 2. get_service_order_counts — comptage en 1 requête GROUP BY (vs 7 COUNT séparés)

-- ── 1. Paiement atomique ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION pay_service_order(
  p_id     UUID,
  p_amount NUMERIC,
  p_method TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order     service_orders%ROWTYPE;
  v_new_paid  NUMERIC;
  v_is_full   BOOLEAN;
  v_paid_at   TIMESTAMPTZ;
BEGIN
  -- Verrouille la ligne pour éviter les paiements concurrents sur le même OT
  SELECT * INTO v_order
  FROM service_orders
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordre de travail introuvable : %', p_id;
  END IF;

  IF v_order.status = 'annule' THEN
    RAISE EXCEPTION 'Impossible d''encaisser un ordre annulé';
  END IF;

  v_new_paid := COALESCE(v_order.paid_amount, 0) + p_amount;
  v_is_full  := v_new_paid >= v_order.total;
  v_paid_at  := NOW();

  UPDATE service_orders SET
    paid_amount    = v_new_paid,
    payment_method = p_method,
    status         = CASE WHEN v_is_full THEN 'paye' ELSE status END,
    paid_at        = CASE WHEN v_is_full THEN v_paid_at ELSE paid_at END
  WHERE id = p_id;

  INSERT INTO service_order_payments (order_id, business_id, amount, method, paid_at)
  VALUES (p_id, v_order.business_id, p_amount, p_method, v_paid_at);

  RETURN json_build_object(
    'id',              v_order.id,
    'business_id',     v_order.business_id,
    'order_number',    v_order.order_number,
    'total',           v_order.total,
    'new_paid_amount', v_new_paid,
    'is_fully_paid',   v_is_full,
    'client_name',     v_order.client_name,
    'client_phone',    v_order.client_phone
  );
END;
$$;

GRANT EXECUTE ON FUNCTION pay_service_order(UUID, NUMERIC, TEXT) TO authenticated;

-- ── 2. Comptage en 1 requête ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_service_order_counts(
  p_business_id UUID,
  p_date        TEXT    DEFAULT NULL,
  p_search      TEXT    DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_object_agg(status, cnt)
  INTO v_result
  FROM (
    SELECT
      status,
      COUNT(*)::INT AS cnt
    FROM service_orders
    WHERE business_id = p_business_id
      AND (
        p_date IS NULL OR p_date = '' OR (
          created_at >= (p_date || 'T00:00:00Z')::TIMESTAMPTZ AND
          created_at <= (p_date || 'T23:59:59Z')::TIMESTAMPTZ
        )
      )
      AND (
        p_search IS NULL OR p_search = '' OR (
          subject_ref  ILIKE '%' || p_search || '%' OR
          subject_info ILIKE '%' || p_search || '%' OR
          client_name  ILIKE '%' || p_search || '%' OR
          client_phone ILIKE '%' || p_search || '%'
        )
      )
    GROUP BY status
  ) sub;

  -- Retourne toujours un objet JSON valide, même si aucun OT
  RETURN COALESCE(v_result, '{}'::JSON);
END;
$$;

GRANT EXECUTE ON FUNCTION get_service_order_counts(UUID, TEXT, TEXT) TO authenticated;
