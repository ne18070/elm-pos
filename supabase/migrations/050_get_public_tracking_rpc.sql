-- ============================================================
-- 050 : RPC get_public_tracking — 1 seul round-trip côté client
-- Remplace 3-4 requêtes séquentielles par un seul appel.
-- ============================================================

CREATE OR REPLACE FUNCTION get_public_tracking(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token  record;
  v_result jsonb;
BEGIN
  SELECT service_order_id, dossier_id, instance_id, expires_at
  INTO v_token
  FROM client_tracking_tokens
  WHERE token = p_token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'invalid_token');
  END IF;

  IF v_token.expires_at < now() THEN
    RETURN jsonb_build_object('error', 'expired_token');
  END IF;

  -- ── Cas Ordre de service ─────────────────────────────────
  IF v_token.service_order_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'type',     'service',
      'business', jsonb_build_object(
        'name',     b.name,
        'logo_url', b.logo_url,
        'phone',    b.phone,
        'address',  b.address
      ),
      'service', to_jsonb(so) || jsonb_build_object(
        'items', COALESCE(
          (SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id)
           FROM service_order_items i WHERE i.order_id = so.id),
          '[]'::jsonb
        )
      ),
      'events', COALESCE(
        (SELECT jsonb_agg(
           jsonb_build_object(
             'id',         e.id,
             'event_type', e.event_type,
             'label',      e.label,
             'actor_name', e.actor_name,
             'created_at', e.created_at
           ) ORDER BY e.created_at
         )
         FROM service_order_events e
         WHERE e.service_order_id = so.id),
        '[]'::jsonb
      ),
      'instance', CASE
        WHEN v_token.instance_id IS NOT NULL THEN
          (SELECT to_jsonb(wi) FROM workflow_instances wi WHERE wi.id = v_token.instance_id)
        ELSE NULL
      END
    )
    INTO v_result
    FROM service_orders so
    JOIN businesses b ON b.id = so.business_id
    WHERE so.id = v_token.service_order_id;

  -- ── Cas Dossier ─────────────────────────────────────────
  ELSIF v_token.dossier_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'type',     'dossier',
      'business', jsonb_build_object(
        'name',     b.name,
        'logo_url', b.logo_url,
        'phone',    b.phone,
        'address',  b.address
      ),
      'dossier', to_jsonb(d),
      'events',  '[]'::jsonb,
      'instance', CASE
        WHEN v_token.instance_id IS NOT NULL THEN
          (SELECT to_jsonb(wi) FROM workflow_instances wi WHERE wi.id = v_token.instance_id)
        ELSE NULL
      END
    )
    INTO v_result
    FROM dossiers d
    JOIN businesses b ON b.id = d.business_id
    WHERE d.id = v_token.dossier_id;

  ELSE
    RETURN jsonb_build_object('error', 'no_data');
  END IF;

  RETURN COALESCE(v_result, jsonb_build_object('error', 'not_found'));
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_tracking TO anon, authenticated;
