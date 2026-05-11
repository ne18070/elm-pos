-- Add 'pause' status to service_orders and update technician RPCs

-- 1. Update the check constraint on service_orders
ALTER TABLE service_orders DROP CONSTRAINT IF EXISTS service_orders_status_check;
ALTER TABLE service_orders ADD CONSTRAINT service_orders_status_check 
  CHECK (status IN ('attente', 'en_cours', 'pause', 'termine', 'paye', 'annule'));

-- 2. Update update_technician_service_order_status to allow 'pause' and new transitions
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

  -- Note: allow termined -> en_cours (re-open) if needed
  IF v_order.status = 'termine' AND p_status <> 'en_cours' THEN
     RETURN jsonb_build_object('error', 'invalid_transition');
  END IF;

  -- Only allow updates if not already paid or cancelled
  IF v_order.status IN ('paye', 'annule') THEN
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

-- 3. Update get_technician_service_orders to include 'pause' in the list
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
              WHEN 'pause' THEN 2
              WHEN 'attente' THEN 3
              WHEN 'termine' THEN 4
              ELSE 5
            END,
            so.created_at DESC
        )
        FROM service_orders so
        WHERE so.business_id = v_token.business_id
          AND so.assigned_to = v_token.staff_id
          AND so.status IN ('attente', 'en_cours', 'pause', 'termine')
      ),
      '[]'::jsonb
    )
  );
END;
$$;

-- 4. Update log_service_order_event trigger function
CREATE OR REPLACE FUNCTION log_service_order_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO service_order_events(service_order_id, business_id, event_type, label)
    VALUES (NEW.id, NEW.business_id, 'created', 'Ordre de travail créé');

  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO service_order_events(service_order_id, business_id, event_type, label)
    VALUES (
      NEW.id,
      NEW.business_id,
      'status_change',
      CASE NEW.status
        WHEN 'en_cours' THEN 'Prise en charge'
        WHEN 'pause'    THEN 'Mis en pause'
        WHEN 'termine'  THEN 'Travaux terminés'
        WHEN 'paye'     THEN 'Paiement reçu'
        WHEN 'annule'   THEN 'Annulé'
        ELSE NEW.status
      END
    );
  END IF;

  RETURN NEW;
END;
$$;
