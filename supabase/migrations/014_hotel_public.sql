-- ============================================================
-- ELM APP — Réservation hôtel publique (page client)
-- Migration 014
-- ============================================================

-- ─── 1. Colonnes supplémentaires sur hotel_reservations ──────────────────────

ALTER TABLE hotel_reservations ADD COLUMN IF NOT EXISTS source             TEXT DEFAULT NULL;
ALTER TABLE hotel_reservations ADD COLUMN IF NOT EXISTS confirmation_token UUID DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_hotel_res_token  ON hotel_reservations(confirmation_token) WHERE confirmation_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hotel_res_source ON hotel_reservations(business_id, source) WHERE source IS NOT NULL;

-- ─── 2. RLS publiques (rôle anon) ───────────────────────────────────────────

-- hotel_rooms : lecture publique des chambres actives
DROP POLICY IF EXISTS "hotel_rooms_public_read" ON hotel_rooms;
CREATE POLICY "hotel_rooms_public_read" ON hotel_rooms
  FOR SELECT TO anon
  USING (is_active = true);

-- hotel_reservations : lecture publique via token de confirmation
DROP POLICY IF EXISTS "hotel_reservations_public_read" ON hotel_reservations;
CREATE POLICY "hotel_reservations_public_read" ON hotel_reservations
  FOR SELECT TO anon
  USING (confirmation_token IS NOT NULL AND source = 'public');

-- ─── 3. Chambres disponibles pour une période ────────────────────────────────

CREATE OR REPLACE FUNCTION get_available_rooms(
  p_business_id UUID,
  p_check_in    DATE,
  p_check_out   DATE
)
RETURNS SETOF hotel_rooms
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.*
  FROM hotel_rooms r
  WHERE r.business_id = p_business_id
    AND r.is_active   = true
    AND r.status      = 'available'
    AND NOT EXISTS (
      SELECT 1
      FROM hotel_reservations res
      WHERE res.room_id    = r.id
        AND res.status    IN ('confirmed', 'checked_in')
        AND res.check_in   < p_check_out
        AND res.check_out  > p_check_in
    )
  ORDER BY r.floor NULLS FIRST, r.number;
$$;

GRANT EXECUTE ON FUNCTION get_available_rooms(UUID, DATE, DATE) TO anon;

-- ─── 4. Créer une réservation publique (SECURITY DEFINER) ───────────────────

CREATE OR REPLACE FUNCTION create_public_reservation(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business    RECORD;
  v_room        RECORD;
  v_guest_id    UUID;
  v_res_id      UUID;
  v_token       UUID;
  v_nights      INTEGER;
  v_total_room  NUMERIC;
  v_check_in    DATE;
  v_check_out   DATE;
BEGIN
  -- Vérifier le business
  SELECT id, owner_id FROM businesses
  INTO v_business
  WHERE id = (p_data->>'business_id')::UUID;
  IF NOT FOUND THEN RAISE EXCEPTION 'Business introuvable'; END IF;

  -- Vérifier que le propriétaire existe bien dans users
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = v_business.owner_id) THEN
    RAISE EXCEPTION 'Propriétaire introuvable';
  END IF;

  -- Vérifier la chambre
  SELECT id, price_per_night FROM hotel_rooms
  INTO v_room
  WHERE id = (p_data->>'room_id')::UUID
    AND business_id = v_business.id
    AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chambre introuvable'; END IF;

  v_check_in  := (p_data->>'check_in')::DATE;
  v_check_out := (p_data->>'check_out')::DATE;

  IF v_check_out <= v_check_in THEN
    RAISE EXCEPTION 'La date de départ doit être après la date d''arrivée';
  END IF;

  -- Vérifier la disponibilité
  IF EXISTS (
    SELECT 1 FROM hotel_reservations
    WHERE room_id   = v_room.id
      AND status   IN ('confirmed', 'checked_in')
      AND check_in  < v_check_out
      AND check_out > v_check_in
  ) THEN
    RAISE EXCEPTION 'Cette chambre n''est plus disponible pour ces dates';
  END IF;

  -- Créer ou récupérer le client hôtel
  -- On crée toujours un nouveau profil pour chaque réservation publique
  INSERT INTO hotel_guests (id, business_id, full_name, phone, email, notes)
  VALUES (
    uuid_generate_v4(),
    v_business.id,
    p_data->>'guest_name',
    NULLIF(p_data->>'guest_phone', ''),
    NULLIF(p_data->>'guest_email', ''),
    NULLIF(p_data->>'notes', '')
  )
  RETURNING id INTO v_guest_id;

  -- Calculer le nombre de nuits et le total
  v_nights     := GREATEST(1, (v_check_out - v_check_in)::INTEGER);
  v_total_room := v_nights * v_room.price_per_night;

  v_res_id := uuid_generate_v4();
  v_token  := uuid_generate_v4();

  -- Créer la réservation
  INSERT INTO hotel_reservations (
    id, business_id, room_id, guest_id,
    check_in, check_out, num_guests,
    price_per_night, total_room, total_services, total,
    paid_amount, status,
    notes, source, confirmation_token,
    created_by, created_at, updated_at
  ) VALUES (
    v_res_id,
    v_business.id,
    v_room.id,
    v_guest_id,
    v_check_in,
    v_check_out,
    COALESCE((p_data->>'num_guests')::INTEGER, 1),
    v_room.price_per_night,
    v_total_room,
    0,
    v_total_room,
    0,
    'confirmed',
    NULLIF(p_data->>'notes', ''),
    'public',
    v_token,
    v_business.owner_id,
    NOW(), NOW()
  );

  RETURN jsonb_build_object(
    'id',                 v_res_id,
    'confirmation_token', v_token,
    'total',              v_total_room,
    'nights',             v_nights
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_public_reservation(JSONB) TO anon;

-- ─── 5. Récupérer une réservation publique par token ────────────────────────

CREATE OR REPLACE FUNCTION get_public_reservation(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res  RECORD;
  v_room RECORD;
BEGIN
  SELECT r.id, r.status, r.check_in, r.check_out, r.num_guests,
         r.price_per_night, r.total_room, r.total_services, r.total,
         r.paid_amount, r.notes, r.created_at,
         g.full_name AS guest_name, g.phone AS guest_phone, g.email AS guest_email
  INTO v_res
  FROM hotel_reservations r
  JOIN hotel_guests g ON g.id = r.guest_id
  WHERE r.confirmation_token = p_token
    AND r.source = 'public'
  LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT hr.number, hr.type, hr.floor, hr.capacity, hr.amenities,
         hr.description, b.name AS business_name, b.phone AS business_phone,
         b.logo_url, b.currency
  INTO v_room
  FROM hotel_reservations res
  JOIN hotel_rooms hr ON hr.id = res.room_id
  JOIN businesses b   ON b.id  = res.business_id
  WHERE res.confirmation_token = p_token
  LIMIT 1;

  RETURN jsonb_build_object(
    'id',             v_res.id,
    'status',         v_res.status,
    'check_in',       v_res.check_in,
    'check_out',      v_res.check_out,
    'num_guests',     v_res.num_guests,
    'price_per_night',v_res.price_per_night,
    'total_room',     v_res.total_room,
    'total',          v_res.total,
    'paid_amount',    v_res.paid_amount,
    'notes',          v_res.notes,
    'created_at',     v_res.created_at,
    'guest_name',     v_res.guest_name,
    'guest_phone',    v_res.guest_phone,
    'guest_email',    v_res.guest_email,
    'room_number',    v_room.number,
    'room_type',      v_room.type,
    'room_floor',     v_room.floor,
    'room_capacity',  v_room.capacity,
    'room_amenities', v_room.amenities,
    'business_name',  v_room.business_name,
    'business_phone', v_room.business_phone,
    'logo_url',       v_room.logo_url,
    'currency',       v_room.currency
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_reservation(UUID) TO anon;
