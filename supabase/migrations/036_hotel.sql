-- ============================================================
-- Migration 036 : Module Hôtel
-- ============================================================

-- ─── 1. Chambres ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hotel_rooms (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  number          TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'double',  -- simple|double|twin|suite|familiale
  floor           TEXT,
  capacity        INT NOT NULL DEFAULT 2,
  price_per_night NUMERIC(12,2) NOT NULL,
  status          TEXT NOT NULL DEFAULT 'available', -- available|occupied|cleaning|maintenance
  description     TEXT,
  amenities       TEXT[] NOT NULL DEFAULT '{}',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_room_status   CHECK (status IN ('available','occupied','cleaning','maintenance')),
  CONSTRAINT chk_room_type     CHECK (type IN ('simple','double','twin','suite','familiale')),
  CONSTRAINT chk_room_capacity CHECK (capacity >= 1),
  CONSTRAINT chk_room_price    CHECK (price_per_night >= 0)
);

-- ─── 2. Clients hôtel ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hotel_guests (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL,
  phone       TEXT,
  email       TEXT,
  id_type     TEXT,      -- CIN|passeport|titre_sejour
  id_number   TEXT,
  nationality TEXT,
  address     TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 3. Réservations ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hotel_reservations (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id      UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  room_id          UUID NOT NULL REFERENCES hotel_rooms(id) ON DELETE RESTRICT,
  guest_id         UUID NOT NULL REFERENCES hotel_guests(id) ON DELETE RESTRICT,
  check_in         DATE NOT NULL,
  check_out        DATE NOT NULL,
  num_guests       INT NOT NULL DEFAULT 1,
  price_per_night  NUMERIC(12,2) NOT NULL,
  total_room       NUMERIC(12,2) NOT NULL,
  total_services   NUMERIC(12,2) NOT NULL DEFAULT 0,
  total            NUMERIC(12,2) NOT NULL,
  paid_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'confirmed', -- confirmed|checked_in|checked_out|cancelled|no_show
  actual_check_in  TIMESTAMPTZ,
  actual_check_out TIMESTAMPTZ,
  notes            TEXT,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_res_dates     CHECK (check_out > check_in),
  CONSTRAINT chk_res_guests    CHECK (num_guests >= 1),
  CONSTRAINT chk_res_status    CHECK (status IN ('confirmed','checked_in','checked_out','cancelled','no_show')),
  CONSTRAINT chk_res_price     CHECK (price_per_night >= 0)
);

-- ─── 4. Prestations / Room Services ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hotel_services (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id    UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  reservation_id UUID NOT NULL REFERENCES hotel_reservations(id) ON DELETE CASCADE,
  label          TEXT NOT NULL,
  amount         NUMERIC(12,2) NOT NULL,
  service_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_svc_amount CHECK (amount >= 0)
);

-- ─── 5. Index ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_hotel_rooms_biz          ON hotel_rooms(business_id);
CREATE INDEX IF NOT EXISTS idx_hotel_rooms_status       ON hotel_rooms(business_id, status);
CREATE INDEX IF NOT EXISTS idx_hotel_guests_biz         ON hotel_guests(business_id);
CREATE INDEX IF NOT EXISTS idx_hotel_reservations_biz   ON hotel_reservations(business_id);
CREATE INDEX IF NOT EXISTS idx_hotel_reservations_room  ON hotel_reservations(room_id);
CREATE INDEX IF NOT EXISTS idx_hotel_reservations_guest ON hotel_reservations(guest_id);
CREATE INDEX IF NOT EXISTS idx_hotel_reservations_dates ON hotel_reservations(business_id, check_in, check_out);
CREATE INDEX IF NOT EXISTS idx_hotel_reservations_stat  ON hotel_reservations(business_id, status);
CREATE INDEX IF NOT EXISTS idx_hotel_services_res       ON hotel_services(reservation_id);

-- ─── 6. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE hotel_rooms         ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_guests        ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_reservations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_services      ENABLE ROW LEVEL SECURITY;

-- hotel_rooms
DROP POLICY IF EXISTS "hotel_rooms_select" ON hotel_rooms;
DROP POLICY IF EXISTS "hotel_rooms_insert" ON hotel_rooms;
DROP POLICY IF EXISTS "hotel_rooms_update" ON hotel_rooms;
DROP POLICY IF EXISTS "hotel_rooms_delete" ON hotel_rooms;
CREATE POLICY "hotel_rooms_select" ON hotel_rooms        USING (business_id = get_user_business_id());
CREATE POLICY "hotel_rooms_insert" ON hotel_rooms FOR INSERT WITH CHECK (business_id = get_user_business_id());
CREATE POLICY "hotel_rooms_update" ON hotel_rooms FOR UPDATE USING (business_id = get_user_business_id());
CREATE POLICY "hotel_rooms_delete" ON hotel_rooms FOR DELETE USING (business_id = get_user_business_id());

-- hotel_guests
DROP POLICY IF EXISTS "hotel_guests_select" ON hotel_guests;
DROP POLICY IF EXISTS "hotel_guests_insert" ON hotel_guests;
DROP POLICY IF EXISTS "hotel_guests_update" ON hotel_guests;
DROP POLICY IF EXISTS "hotel_guests_delete" ON hotel_guests;
CREATE POLICY "hotel_guests_select" ON hotel_guests        USING (business_id = get_user_business_id());
CREATE POLICY "hotel_guests_insert" ON hotel_guests FOR INSERT WITH CHECK (business_id = get_user_business_id());
CREATE POLICY "hotel_guests_update" ON hotel_guests FOR UPDATE USING (business_id = get_user_business_id());
CREATE POLICY "hotel_guests_delete" ON hotel_guests FOR DELETE USING (business_id = get_user_business_id());

-- hotel_reservations
DROP POLICY IF EXISTS "hotel_reservations_select" ON hotel_reservations;
DROP POLICY IF EXISTS "hotel_reservations_insert" ON hotel_reservations;
DROP POLICY IF EXISTS "hotel_reservations_update" ON hotel_reservations;
DROP POLICY IF EXISTS "hotel_reservations_delete" ON hotel_reservations;
CREATE POLICY "hotel_reservations_select" ON hotel_reservations        USING (business_id = get_user_business_id());
CREATE POLICY "hotel_reservations_insert" ON hotel_reservations FOR INSERT WITH CHECK (business_id = get_user_business_id());
CREATE POLICY "hotel_reservations_update" ON hotel_reservations FOR UPDATE USING (business_id = get_user_business_id());
CREATE POLICY "hotel_reservations_delete" ON hotel_reservations FOR DELETE USING (business_id = get_user_business_id());

-- hotel_services
DROP POLICY IF EXISTS "hotel_services_select" ON hotel_services;
DROP POLICY IF EXISTS "hotel_services_insert" ON hotel_services;
DROP POLICY IF EXISTS "hotel_services_update" ON hotel_services;
DROP POLICY IF EXISTS "hotel_services_delete" ON hotel_services;
CREATE POLICY "hotel_services_select" ON hotel_services        USING (business_id = get_user_business_id());
CREATE POLICY "hotel_services_insert" ON hotel_services FOR INSERT WITH CHECK (business_id = get_user_business_id());
CREATE POLICY "hotel_services_update" ON hotel_services FOR UPDATE USING (business_id = get_user_business_id());
CREATE POLICY "hotel_services_delete" ON hotel_services FOR DELETE USING (business_id = get_user_business_id());
