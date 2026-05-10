-- Secure technician links for service order progress updates.

CREATE TABLE IF NOT EXISTS service_order_technician_tokens (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id UUID NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  business_id      UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id         UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  token            TEXT NOT NULL UNIQUE,
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
  last_used_at     TIMESTAMPTZ,
  created_by       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sott_order ON service_order_technician_tokens(service_order_id);
CREATE INDEX IF NOT EXISTS idx_sott_staff ON service_order_technician_tokens(staff_id);
CREATE INDEX IF NOT EXISTS idx_sott_token_valid ON service_order_technician_tokens(token, expires_at);

ALTER TABLE service_order_technician_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sott_member_read" ON service_order_technician_tokens;
CREATE POLICY "sott_member_read" ON service_order_technician_tokens
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "service_orders_technician_token_read" ON service_orders;
CREATE POLICY "service_orders_technician_token_read" ON service_orders
  FOR SELECT TO anon, authenticated
  USING (
    id IN (
      SELECT service_order_id
      FROM service_order_technician_tokens
      WHERE expires_at > NOW()
    )
  );

CREATE OR REPLACE FUNCTION get_or_create_service_technician_token(
  p_business_id UUID,
  p_service_order_id UUID,
  p_staff_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM business_members
    WHERE business_id = p_business_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM service_orders so
    JOIN staff s ON s.id = p_staff_id AND s.business_id = so.business_id
    WHERE so.id = p_service_order_id
      AND so.business_id = p_business_id
      AND so.assigned_to = p_staff_id
      AND s.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Technician is not assigned to this order';
  END IF;

  SELECT token INTO v_token
  FROM service_order_technician_tokens
  WHERE service_order_id = p_service_order_id
    AND staff_id = p_staff_id
    AND expires_at > NOW()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_token IS NOT NULL THEN
    RETURN v_token;
  END IF;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO service_order_technician_tokens(
    service_order_id, business_id, staff_id, token, created_by
  )
  VALUES (p_service_order_id, p_business_id, p_staff_id, v_token, auth.uid());

  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION get_technician_service_order(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token RECORD;
BEGIN
  SELECT t.service_order_id, t.staff_id, t.expires_at, s.name AS staff_name
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

  RETURN (
    SELECT jsonb_build_object(
      'business', jsonb_build_object('name', b.name, 'logo_url', b.logo_url),
      'technician', jsonb_build_object('id', v_token.staff_id, 'name', v_token.staff_name),
      'order', jsonb_build_object(
        'id', so.id,
        'order_number', so.order_number,
        'status', so.status,
        'subject_ref', so.subject_ref,
        'subject_type', so.subject_type,
        'subject_info', so.subject_info,
        'client_name', so.client_name,
        'notes', so.notes,
        'created_at', so.created_at
      ),
      'items', COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
          'id', i.id,
          'name', i.name,
          'quantity', i.quantity
        ) ORDER BY i.id)
        FROM service_order_items i
        WHERE i.order_id = so.id),
        '[]'::jsonb
      )
    )
    FROM service_orders so
    JOIN businesses b ON b.id = so.business_id
    WHERE so.id = v_token.service_order_id
      AND so.assigned_to = v_token.staff_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION update_technician_service_order_status(
  p_token TEXT,
  p_status TEXT
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
  SELECT t.service_order_id, t.staff_id, t.expires_at, s.name AS staff_name
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

  SELECT id, business_id, order_number, status, assigned_to
  INTO v_order
  FROM service_orders
  WHERE id = v_token.service_order_id
  FOR UPDATE;

  IF NOT FOUND OR v_order.assigned_to IS DISTINCT FROM v_token.staff_id THEN
    RETURN jsonb_build_object('error', 'not_assigned');
  END IF;

  IF p_status NOT IN ('en_cours', 'termine') THEN
    RETURN jsonb_build_object('error', 'status_not_allowed');
  END IF;

  IF v_order.status = 'attente' AND p_status <> 'en_cours' THEN
    RETURN jsonb_build_object('error', 'invalid_transition');
  END IF;

  IF v_order.status = 'en_cours' AND p_status <> 'termine' THEN
    RETURN jsonb_build_object('error', 'invalid_transition');
  END IF;

  IF v_order.status NOT IN ('attente', 'en_cours') THEN
    RETURN jsonb_build_object('error', 'closed_order');
  END IF;

  UPDATE service_orders
  SET status = p_status,
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

GRANT EXECUTE ON FUNCTION get_or_create_service_technician_token(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_technician_service_order(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION update_technician_service_order_status(TEXT, TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION get_technician_service_orders(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token RECORD;
BEGIN
  SELECT t.business_id, t.staff_id, t.expires_at, s.name AS staff_name, b.name AS business_name, b.logo_url
  INTO v_token
  FROM service_order_technician_tokens t
  JOIN staff s ON s.id = t.staff_id
  JOIN businesses b ON b.id = t.business_id
  WHERE t.token = p_token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'invalid_token');
  END IF;

  IF v_token.expires_at < NOW() THEN
    RETURN jsonb_build_object('error', 'expired_token');
  END IF;

  UPDATE service_order_technician_tokens
  SET last_used_at = NOW()
  WHERE token = p_token;

  RETURN jsonb_build_object(
    'business', jsonb_build_object('name', v_token.business_name, 'logo_url', v_token.logo_url),
    'technician', jsonb_build_object('id', v_token.staff_id, 'name', v_token.staff_name),
    'orders', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', so.id,
            'order_number', so.order_number,
            'status', so.status,
            'subject_ref', so.subject_ref,
            'subject_type', so.subject_type,
            'subject_info', so.subject_info,
            'client_name', so.client_name,
            'notes', so.notes,
            'created_at', so.created_at,
            'started_at', so.started_at,
            'finished_at', so.finished_at,
            'items', COALESCE(
              (
                SELECT jsonb_agg(jsonb_build_object(
                  'id', i.id,
                  'name', i.name,
                  'quantity', i.quantity
                ) ORDER BY i.id)
                FROM service_order_items i
                WHERE i.order_id = so.id
              ),
              '[]'::jsonb
            )
          )
          ORDER BY
            CASE so.status
              WHEN 'en_cours' THEN 1
              WHEN 'attente' THEN 2
              WHEN 'termine' THEN 3
              ELSE 4
            END,
            so.created_at DESC
        )
        FROM service_orders so
        WHERE so.business_id = v_token.business_id
          AND so.assigned_to = v_token.staff_id
          AND so.status IN ('attente', 'en_cours', 'termine')
      ),
      '[]'::jsonb
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_technician_service_orders(TEXT) TO anon, authenticated;
