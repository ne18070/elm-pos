-- Fix: update_technician_service_order_status now takes an explicit p_order_id.
-- The token authenticates the technician; p_order_id identifies which OT to update.
-- The RPC verifies the order belongs to the same business and is assigned to the same technician.

CREATE OR REPLACE FUNCTION update_technician_service_order_status(
  p_token    TEXT,
  p_order_id UUID,
  p_status   TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token RECORD;
  v_order RECORD;
BEGIN
  -- Validate token
  SELECT t.business_id, t.staff_id, t.expires_at, s.name AS staff_name
  INTO v_token
  FROM service_order_technician_tokens t
  JOIN staff s ON s.id = t.staff_id
  WHERE t.token = p_token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'invalid_token');
  END IF;

  IF v_token.expires_at < NOW() THEN
    RETURN jsonb_build_object('error', 'expired_token');
  END IF;

  -- Load the target order, verify it belongs to the same business and is assigned to this technician
  SELECT id, business_id, order_number, status, assigned_to
  INTO v_order
  FROM service_orders
  WHERE id = p_order_id
    AND business_id = v_token.business_id
    AND assigned_to = v_token.staff_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_assigned');
  END IF;

  -- Allowed statuses for technicians
  IF p_status NOT IN ('en_cours', 'pause', 'termine') THEN
    RETURN jsonb_build_object('error', 'status_not_allowed');
  END IF;

  -- Transition validation
  IF v_order.status = 'attente' AND p_status <> 'en_cours' THEN
    RETURN jsonb_build_object('error', 'invalid_transition');
  END IF;

  IF v_order.status = 'pause' AND p_status <> 'en_cours' THEN
    RETURN jsonb_build_object('error', 'invalid_transition');
  END IF;

  IF v_order.status = 'termine' AND p_status <> 'en_cours' THEN
    RETURN jsonb_build_object('error', 'invalid_transition');
  END IF;

  IF v_order.status IN ('paye', 'annule') THEN
    RETURN jsonb_build_object('error', 'closed_order');
  END IF;

  UPDATE service_orders
  SET status     = p_status,
      started_at = CASE WHEN p_status = 'en_cours' AND started_at IS NULL THEN NOW() ELSE started_at END,
      finished_at = CASE WHEN p_status = 'termine' THEN NOW() ELSE finished_at END
  WHERE id = v_order.id;

  UPDATE service_order_technician_tokens
  SET last_used_at = NOW()
  WHERE token = p_token;

  INSERT INTO activity_logs(business_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_order.business_id,
    'service_order.technician_status_updated',
    'service_order',
    v_order.id::text,
    jsonb_build_object(
      'order_number', v_order.order_number,
      'status', p_status,
      'staff_id', v_token.staff_id,
      'staff_name', v_token.staff_name
    )
  );

  RETURN jsonb_build_object('success', true, 'status', p_status);
END;
$$;

GRANT EXECUTE ON FUNCTION update_technician_service_order_status(TEXT, UUID, TEXT) TO anon, authenticated;
