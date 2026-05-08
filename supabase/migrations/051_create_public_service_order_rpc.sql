-- ============================================================
-- 051 : RPC publique pour créer un OT depuis la page client
-- Utilise SECURITY DEFINER pour contourner la RLS en toute
-- sécurité (validation business + protection contre l'injection).
-- ============================================================

-- Colonne source pour tracer l'origine des OT
ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'dashboard'
  CHECK (source IN ('dashboard', 'public'));

-- ── Fonction ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_public_service_order(
  p_business_id  uuid,
  p_client_name  text,
  p_client_phone text,
  p_subject_ref  text    DEFAULT NULL,
  p_subject_type text    DEFAULT 'autre',
  p_subject_info text    DEFAULT NULL,
  p_notes        text    DEFAULT NULL,
  p_items        jsonb   DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order  record;
  v_total  numeric := 0;
BEGIN
  -- Vérifier que l'entreprise existe
  IF NOT EXISTS (SELECT 1 FROM businesses WHERE id = p_business_id) THEN
    RAISE EXCEPTION 'Établissement introuvable';
  END IF;

  -- Calculer le total
  SELECT COALESCE(SUM((item->>'price')::numeric * (item->>'quantity')::int), 0)
  INTO v_total
  FROM jsonb_array_elements(p_items) AS item;

  -- Créer l'OT
  INSERT INTO service_orders (
    business_id, subject_ref, subject_type, subject_info,
    client_name, client_phone, notes, total, paid_amount, status, source
  )
  VALUES (
    p_business_id,
    NULLIF(TRIM(COALESCE(p_subject_ref,  '')), ''),
    COALESCE(NULLIF(TRIM(p_subject_type), ''), 'autre'),
    NULLIF(TRIM(COALESCE(p_subject_info, '')), ''),
    TRIM(p_client_name),
    TRIM(p_client_phone),
    NULLIF(TRIM(COALESCE(p_notes, '')), ''),
    v_total,
    0,
    'attente',
    'public'
  )
  RETURNING * INTO v_order;

  -- Insérer les lignes de prestation
  INSERT INTO service_order_items (order_id, service_id, name, price, quantity, total)
  SELECT
    v_order.id,
    NULLIF(item->>'service_id', '')::uuid,
    item->>'name',
    (item->>'price')::numeric,
    (item->>'quantity')::int,
    (item->>'price')::numeric * (item->>'quantity')::int
  FROM jsonb_array_elements(p_items) AS item;

  RETURN jsonb_build_object(
    'id',           v_order.id,
    'order_number', v_order.order_number,
    'status',       v_order.status,
    'total',        v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_public_service_order TO anon, authenticated;
