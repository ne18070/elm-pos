-- ELM APP - Annulation des contrats de location
-- Migration 020
-- ============================================================

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS start_time time,
  ADD COLUMN IF NOT EXISTS end_time time,
  ADD COLUMN IF NOT EXISTS documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS required_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pickup_inspection jsonb,
  ADD COLUMN IF NOT EXISTS return_inspection jsonb,
  ADD COLUMN IF NOT EXISTS extra_charges numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

COMMENT ON COLUMN contracts.start_time IS 'Heure de prise en charge du vehicule.';
COMMENT ON COLUMN contracts.end_time IS 'Heure de restitution du vehicule.';
COMMENT ON COLUMN contracts.documents IS 'Documents joints au contrat: CNI, permis, justificatifs, etc.';
COMMENT ON COLUMN contracts.required_documents IS 'Documents que le client doit uploader avant signature.';
COMMENT ON COLUMN contracts.pickup_inspection IS 'Etat du vehicule au depart: kilometrage, carburant, etat, notes.';
COMMENT ON COLUMN contracts.return_inspection IS 'Etat du vehicule au retour: kilometrage, carburant, etat, notes, frais.';
COMMENT ON COLUMN contracts.extra_charges IS 'Frais supplementaires constates au retour.';

ALTER TABLE rental_vehicles
  ADD COLUMN IF NOT EXISTS owner_type text NOT NULL DEFAULT 'owned' CHECK (owner_type IN ('owned','third_party')),
  ADD COLUMN IF NOT EXISTS owner_name text,
  ADD COLUMN IF NOT EXISTS owner_phone text,
  ADD COLUMN IF NOT EXISTS commission_type text NOT NULL DEFAULT 'percent' CHECK (commission_type IN ('percent','fixed')),
  ADD COLUMN IF NOT EXISTS commission_value numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS owner_report_token text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex');

ALTER TABLE voitures
  ADD COLUMN IF NOT EXISTS owner_type text NOT NULL DEFAULT 'owned' CHECK (owner_type IN ('owned','third_party')),
  ADD COLUMN IF NOT EXISTS owner_name text,
  ADD COLUMN IF NOT EXISTS owner_phone text,
  ADD COLUMN IF NOT EXISTS commission_type text NOT NULL DEFAULT 'percent' CHECK (commission_type IN ('percent','fixed')),
  ADD COLUMN IF NOT EXISTS commission_value numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS owner_report_token text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex');

CREATE UNIQUE INDEX IF NOT EXISTS idx_rental_vehicles_owner_report_token ON rental_vehicles(owner_report_token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_voitures_owner_report_token ON voitures(owner_report_token);

COMMENT ON COLUMN rental_vehicles.owner_type IS 'owned = vehicule propre, third_party = vehicule confie par un proprietaire tiers.';
COMMENT ON COLUMN rental_vehicles.commission_value IS 'Commission retenue par l''entreprise: pourcentage ou montant fixe selon commission_type.';
COMMENT ON COLUMN voitures.owner_type IS 'owned = vehicule propre, third_party = vehicule confie pour vente.';
COMMENT ON COLUMN voitures.commission_value IS 'Commission retenue par l''entreprise: pourcentage ou montant fixe selon commission_type.';
COMMENT ON COLUMN contracts.cancelled_at IS 'Date d''annulation du contrat de location.';
COMMENT ON COLUMN contracts.cancellation_reason IS 'Motif interne de l''annulation du contrat.';

CREATE OR REPLACE FUNCTION get_available_vehicles(
  p_business_id UUID,
  p_start_date  DATE,
  p_end_date    DATE,
  p_start_time  TIME,
  p_end_time    TIME
)
RETURNS SETOF rental_vehicles
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT v.*
  FROM rental_vehicles v
  WHERE v.business_id = p_business_id
    AND (
      v.is_available = true
      OR EXISTS (
        SELECT 1
        FROM contracts cx
        WHERE cx.vehicle_id = v.id
          AND cx.status IN ('sent', 'signed', 'active')
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM contracts c
      WHERE c.vehicle_id = v.id
        AND c.status    IN ('draft', 'sent', 'signed', 'active')
        AND (c.start_date + COALESCE(c.start_time, '09:00'::TIME)) < (p_end_date + p_end_time)
        AND (c.end_date   + COALESCE(c.end_time,   '18:00'::TIME)) > (p_start_date + p_start_time)
    )
  ORDER BY v.price_per_day ASC;
$$;

GRANT EXECUTE ON FUNCTION get_available_vehicles(UUID, DATE, DATE, TIME, TIME) TO anon;

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
  v_start_time TIME;
  v_end_time   TIME;
  v_days       INTEGER;
  v_total      NUMERIC;
  v_price_day  NUMERIC;
BEGIN
  SELECT id, owner_id, name, currency FROM businesses
  INTO v_business
  WHERE id = (p_data->>'business_id')::UUID;
  IF NOT FOUND THEN RAISE EXCEPTION 'Business introuvable'; END IF;

  SELECT id, price_per_day, deposit_amount, is_available FROM rental_vehicles
  INTO v_vehicle
  WHERE id = (p_data->>'vehicle_id')::UUID
    AND business_id = v_business.id
    AND (
      is_available = true
      OR EXISTS (
        SELECT 1
        FROM contracts cx
        WHERE cx.vehicle_id = rental_vehicles.id
          AND cx.status IN ('sent', 'signed', 'active')
      )
    );
  IF NOT FOUND THEN RAISE EXCEPTION 'Vehicule introuvable ou indisponible'; END IF;

  v_start_date := (p_data->>'start_date')::DATE;
  v_end_date   := (p_data->>'end_date')::DATE;
  v_start_time := COALESCE(NULLIF(p_data->>'start_time', '')::TIME, '09:00'::TIME);
  v_end_time   := COALESCE(NULLIF(p_data->>'end_time', '')::TIME, '18:00'::TIME);

  IF (v_end_date + v_end_time) <= (v_start_date + v_start_time) THEN
    RAISE EXCEPTION 'La restitution doit etre apres la prise en charge';
  END IF;

  IF EXISTS (
    SELECT 1 FROM contracts
    WHERE vehicle_id = v_vehicle.id
      AND status    IN ('draft', 'sent', 'signed', 'active')
      AND (start_date + COALESCE(start_time, '09:00'::TIME)) < (v_end_date + v_end_time)
      AND (end_date   + COALESCE(end_time,   '18:00'::TIME)) > (v_start_date + v_start_time)
  ) THEN
    RAISE EXCEPTION 'Ce vehicule n''est plus disponible pour ces dates';
  END IF;

  v_days      := GREATEST(1, (v_end_date - v_start_date)::INTEGER);
  v_price_day := v_vehicle.price_per_day;
  v_total     := v_days * v_price_day;
  v_token     := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires   := NOW() + INTERVAL '30 days';
  v_contract_id := gen_random_uuid();

  INSERT INTO contracts (
    id, business_id, vehicle_id,
    client_name, client_phone, client_email,
    client_id_number, client_address,
    start_date, start_time, end_date, end_time,
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
    v_start_time,
    v_end_date,
    v_end_time,
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
  SELECT c.id, c.status, c.start_date, c.start_time, c.end_date, c.end_time,
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
    'start_time',      v_c.start_time,
    'end_date',        v_c.end_date,
    'end_time',        v_c.end_time,
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

CREATE OR REPLACE FUNCTION get_vehicle_owner_report(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_rental RECORD;
  v_sale RECORD;
  v_total numeric := 0;
  v_commission numeric := 0;
BEGIN
  SELECT rv.*, b.name AS business_name, b.currency, b.phone AS business_phone
  INTO v_rental
  FROM rental_vehicles rv
  JOIN businesses b ON b.id = rv.business_id
  WHERE rv.owner_report_token = p_token
  LIMIT 1;

  IF FOUND THEN
    SELECT COALESCE(SUM(c.total_amount), 0)
    INTO v_total
    FROM contracts c
    WHERE c.vehicle_id = v_rental.id
      AND c.status IN ('sent', 'signed', 'active', 'archived');

    v_commission := CASE
      WHEN v_rental.owner_type = 'third_party' AND v_rental.commission_type = 'fixed'
        THEN LEAST(v_total, GREATEST(0, v_rental.commission_value))
      WHEN v_rental.owner_type = 'third_party'
        THEN LEAST(v_total, GREATEST(0, v_total * (v_rental.commission_value / 100)))
      ELSE v_total
    END;

    RETURN jsonb_build_object(
      'kind', 'rental',
      'business_name', v_rental.business_name,
      'business_phone', v_rental.business_phone,
      'currency', v_rental.currency,
      'vehicle', jsonb_build_object(
        'name', v_rental.name,
        'brand', v_rental.brand,
        'model', v_rental.model,
        'year', v_rental.year,
        'plate', v_rental.license_plate,
        'image', v_rental.image_url,
        'owner_name', v_rental.owner_name,
        'owner_phone', v_rental.owner_phone,
        'commission_type', v_rental.commission_type,
        'commission_value', v_rental.commission_value
      ),
      'totals', jsonb_build_object(
        'gross', v_total,
        'commission', v_commission,
        'owner_share', GREATEST(0, v_total - v_commission)
      ),
      'rentals', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'client_name', c.client_name,
          'start_date', c.start_date,
          'start_time', c.start_time,
          'end_date', c.end_date,
          'end_time', c.end_time,
          'status', c.status,
          'total_amount', c.total_amount,
          'amount_paid', c.amount_paid
        ) ORDER BY c.start_date DESC)
        FROM contracts c
        WHERE c.vehicle_id = v_rental.id
          AND c.status IN ('sent', 'signed', 'archived', 'cancelled')
      ), '[]'::jsonb),
      'sales', '[]'::jsonb,
      'expenses', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'date', je.entry_date,
          'label', je.description,
          'amount', COALESCE((
            SELECT SUM(jl.debit)
            FROM journal_lines jl
            WHERE jl.entry_id = je.id
              AND jl.account_code LIKE '6%'
          ), 0)
        ) ORDER BY je.entry_date DESC)
        FROM journal_entries je
        WHERE je.source = 'manual'
          AND je.source_id = v_rental.id
      ), '[]'::jsonb)
    );
  END IF;

  SELECT v.*, b.name AS business_name, b.currency, b.phone AS business_phone
  INTO v_sale
  FROM voitures v
  JOIN businesses b ON b.id = v.business_id
  WHERE v.owner_report_token = p_token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_total := CASE WHEN v_sale.statut = 'vendu' THEN v_sale.prix ELSE 0 END;
  v_commission := CASE
    WHEN v_sale.owner_type = 'third_party' AND v_sale.commission_type = 'fixed'
      THEN LEAST(v_total, GREATEST(0, v_sale.commission_value))
    WHEN v_sale.owner_type = 'third_party'
      THEN LEAST(v_total, GREATEST(0, v_total * (v_sale.commission_value / 100)))
    ELSE v_total
  END;

  RETURN jsonb_build_object(
    'kind', 'sale',
    'business_name', v_sale.business_name,
    'business_phone', v_sale.business_phone,
    'currency', v_sale.currency,
    'vehicle', jsonb_build_object(
      'name', concat_ws(' ', v_sale.marque, v_sale.modele),
      'brand', v_sale.marque,
      'model', v_sale.modele,
      'year', v_sale.annee,
      'plate', NULL,
      'image', v_sale.image_principale,
      'owner_name', v_sale.owner_name,
      'owner_phone', v_sale.owner_phone,
      'commission_type', v_sale.commission_type,
      'commission_value', v_sale.commission_value
    ),
    'totals', jsonb_build_object(
      'gross', v_total,
      'commission', v_commission,
      'owner_share', GREATEST(0, v_total - v_commission)
    ),
    'rentals', '[]'::jsonb,
    'sales', jsonb_build_array(jsonb_build_object(
      'status', v_sale.statut,
      'price', v_sale.prix,
      'updated_at', v_sale.updated_at
    )),
    'expenses', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'date', je.entry_date,
        'label', je.description,
        'amount', COALESCE((
          SELECT SUM(jl.debit)
          FROM journal_lines jl
          WHERE jl.entry_id = je.id
            AND jl.account_code LIKE '6%'
        ), 0)
      ) ORDER BY je.entry_date DESC)
      FROM journal_entries je
      WHERE je.source = 'manual'
        AND je.source_id = v_sale.id
    ), '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_vehicle_owner_report(TEXT) TO anon;

