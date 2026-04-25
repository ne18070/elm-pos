-- ============================================================
-- ELM APP — Location de véhicule publique (page client)
-- Migration 016
-- ============================================================

-- ─── 1. Colonne source sur contracts ────────────────────────────────────────

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS source TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_contracts_source ON contracts(business_id, source) WHERE source IS NOT NULL;

-- ─── 2. RLS publiques (rôle anon) ───────────────────────────────────────────

-- rental_vehicles : lecture publique des véhicules disponibles
DROP POLICY IF EXISTS "rental_vehicles_public_read" ON rental_vehicles;
CREATE POLICY "rental_vehicles_public_read" ON rental_vehicles
  FOR SELECT TO anon
  USING (is_available = true);

-- contracts : lecture publique via token (demandes publiques uniquement)
DROP POLICY IF EXISTS "contracts_public_read" ON contracts;
CREATE POLICY "contracts_public_read" ON contracts
  FOR SELECT TO anon
  USING (token IS NOT NULL AND source = 'public');

-- ─── 3. Véhicules disponibles pour une période ──────────────────────────────

CREATE OR REPLACE FUNCTION get_available_vehicles(
  p_business_id UUID,
  p_start_date  DATE,
  p_end_date    DATE
)
RETURNS SETOF rental_vehicles
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT v.*
  FROM rental_vehicles v
  WHERE v.business_id = p_business_id
    AND v.is_available = true
    AND NOT EXISTS (
      SELECT 1
      FROM contracts c
      WHERE c.vehicle_id = v.id
        AND c.status    IN ('draft', 'sent', 'signed')
        AND c.source     = 'public'
        AND c.start_date < p_end_date
        AND c.end_date   > p_start_date
    )
  ORDER BY v.price_per_day ASC;
$$;

GRANT EXECUTE ON FUNCTION get_available_vehicles(UUID, DATE, DATE) TO anon;

-- ─── 4. Créer une demande de location publique ──────────────────────────────

CREATE OR REPLACE FUNCTION create_public_rental_request(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_business   RECORD;
  v_vehicle    RECORD;
  v_contract_id UUID;
  v_token      TEXT;
  v_expires    TIMESTAMPTZ;
  v_start_date DATE;
  v_end_date   DATE;
  v_days       INTEGER;
  v_total      NUMERIC;
  v_price_day  NUMERIC;
BEGIN
  -- Vérifier le business
  SELECT id, owner_id, name, currency FROM businesses
  INTO v_business
  WHERE id = (p_data->>'business_id')::UUID;
  IF NOT FOUND THEN RAISE EXCEPTION 'Business introuvable'; END IF;

  -- Vérifier le véhicule
  SELECT id, price_per_day, deposit_amount, is_available FROM rental_vehicles
  INTO v_vehicle
  WHERE id = (p_data->>'vehicle_id')::UUID
    AND business_id = v_business.id
    AND is_available = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Véhicule introuvable ou indisponible'; END IF;

  v_start_date := (p_data->>'start_date')::DATE;
  v_end_date   := (p_data->>'end_date')::DATE;

  IF v_end_date <= v_start_date THEN
    RAISE EXCEPTION 'La date de retour doit être après la date de départ';
  END IF;

  -- Vérifier la disponibilité
  IF EXISTS (
    SELECT 1 FROM contracts
    WHERE vehicle_id = v_vehicle.id
      AND status    IN ('draft', 'sent', 'signed')
      AND source     = 'public'
      AND start_date < v_end_date
      AND end_date   > v_start_date
  ) THEN
    RAISE EXCEPTION 'Ce véhicule n''est plus disponible pour ces dates';
  END IF;

  v_days     := GREATEST(1, (v_end_date - v_start_date)::INTEGER);
  v_price_day := v_vehicle.price_per_day;
  v_total    := v_days * v_price_day;

  -- Générer le token (64 hex chars)
  v_token  := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires := NOW() + INTERVAL '30 days';
  v_contract_id := gen_random_uuid();

  INSERT INTO contracts (
    id, business_id, vehicle_id,
    client_name, client_phone, client_email,
    client_id_number, client_address,
    start_date, end_date,
    pickup_location, return_location,
    price_per_day, deposit_amount, total_amount,
    currency, body,
    token, token_expires_at,
    status, source,
    notes,
    created_by, created_at, updated_at
  ) VALUES (
    v_contract_id,
    v_business.id,
    v_vehicle.id,
    p_data->>'client_name',
    NULLIF(p_data->>'client_phone', ''),
    NULLIF(p_data->>'client_email', ''),
    NULLIF(p_data->>'client_id_number', ''),
    NULLIF(p_data->>'client_address', ''),
    v_start_date,
    v_end_date,
    NULLIF(p_data->>'pickup_location', ''),
    NULLIF(p_data->>'return_location', ''),
    v_price_day,
    v_vehicle.deposit_amount,
    v_total,
    v_business.currency,
    '',
    v_token,
    v_expires,
    'draft',
    'public',
    NULLIF(p_data->>'notes', ''),
    v_business.owner_id,
    NOW(), NOW()
  );

  RETURN jsonb_build_object(
    'id',    v_contract_id,
    'token', v_token,
    'total', v_total,
    'days',  v_days
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_public_rental_request(JSONB) TO anon;

-- ─── 5. Récupérer une demande par token ─────────────────────────────────────

CREATE OR REPLACE FUNCTION get_public_rental_request(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_c RECORD;
  v_v RECORD;
BEGIN
  SELECT c.id, c.status, c.start_date, c.end_date,
         c.client_name, c.client_phone, c.client_email,
         c.price_per_day, c.deposit_amount, c.total_amount,
         c.pickup_location, c.return_location,
         c.notes, c.created_at, c.currency
  INTO v_c
  FROM contracts c
  WHERE c.token = p_token AND c.source = 'public'
  LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT rv.name, rv.brand, rv.model, rv.year, rv.license_plate,
         rv.color, rv.image_url,
         b.name AS business_name, b.phone AS business_phone,
         b.logo_url, b.currency AS biz_currency
  INTO v_v
  FROM contracts c
  JOIN rental_vehicles rv ON rv.id = c.vehicle_id
  JOIN businesses b        ON b.id  = c.business_id
  WHERE c.token = p_token
  LIMIT 1;

  RETURN jsonb_build_object(
    'id',              v_c.id,
    'status',          v_c.status,
    'start_date',      v_c.start_date,
    'end_date',        v_c.end_date,
    'client_name',     v_c.client_name,
    'client_phone',    v_c.client_phone,
    'client_email',    v_c.client_email,
    'price_per_day',   v_c.price_per_day,
    'deposit_amount',  v_c.deposit_amount,
    'total_amount',    v_c.total_amount,
    'pickup_location', v_c.pickup_location,
    'return_location', v_c.return_location,
    'notes',           v_c.notes,
    'created_at',      v_c.created_at,
    'currency',        v_c.currency,
    'vehicle_name',    v_v.name,
    'vehicle_brand',   v_v.brand,
    'vehicle_model',   v_v.model,
    'vehicle_year',    v_v.year,
    'vehicle_plate',   v_v.license_plate,
    'vehicle_color',   v_v.color,
    'vehicle_image',   v_v.image_url,
    'business_name',   v_v.business_name,
    'business_phone',  v_v.business_phone,
    'logo_url',        v_v.logo_url
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_rental_request(TEXT) TO anon;
