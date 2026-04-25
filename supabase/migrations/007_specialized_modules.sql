-- File: 036_hotel.sql
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


-- File: 039_hotel_availability.sql
-- ─── Hotel room availability constraint ──────────────────────────────────────
--
-- Prevents overlapping reservations for the same room.
-- Active statuses that block availability: confirmed, checked_in
-- Ignored statuses: cancelled, checked_out, no_show
--
-- Overlap rule (exclusive end): new_check_in < existing.check_out
--                            AND existing.check_in < new_check_out

CREATE OR REPLACE FUNCTION check_hotel_room_availability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  conflict_count INT;
BEGIN
  -- Only check active reservations
  IF NEW.status NOT IN ('confirmed', 'checked_in') THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO conflict_count
  FROM hotel_reservations
  WHERE room_id   = NEW.room_id
    AND id       != NEW.id                          -- exclude self (for updates)
    AND status   IN ('confirmed', 'checked_in')
    AND check_in  < NEW.check_out                   -- existing starts before new ends
    AND check_out > NEW.check_in;                   -- existing ends after new starts

  IF conflict_count > 0 THEN
    RAISE EXCEPTION 'ROOM_UNAVAILABLE: Cette chambre est déjà réservée sur cette période.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hotel_room_availability ON hotel_reservations;
CREATE TRIGGER trg_hotel_room_availability
  BEFORE INSERT OR UPDATE ON hotel_reservations
  FOR EACH ROW EXECUTE FUNCTION check_hotel_room_availability();

-- Helper RPC: returns conflicting reservations for a room + date range
-- Used client-side to show availability before attempting to save.
CREATE OR REPLACE FUNCTION get_room_conflicts(
  p_room_id    UUID,
  p_check_in   DATE,
  p_check_out  DATE,
  p_exclude_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id          UUID,
  check_in    DATE,
  check_out   DATE,
  status      TEXT,
  guest_name  TEXT
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    r.id, r.check_in, r.check_out, r.status,
    g.full_name
  FROM hotel_reservations r
  LEFT JOIN hotel_guests g ON g.id = r.guest_id
  WHERE r.room_id   = p_room_id
    AND r.id       != COALESCE(p_exclude_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND r.status   IN ('confirmed', 'checked_in')
    AND r.check_in  < p_check_out
    AND r.check_out > p_check_in;
$$;

GRANT EXECUTE ON FUNCTION get_room_conflicts(UUID, DATE, DATE, UUID) TO authenticated;


-- File: 043_hotel_improvements.sql
-- ─── Hotel improvements ───────────────────────────────────────────────────────

-- 1. Table hotel_payments : paiements partiels / acomptes liés aux réservations
CREATE TABLE IF NOT EXISTS public.hotel_payments (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    uuid          NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  reservation_id uuid          NOT NULL REFERENCES public.hotel_reservations(id) ON DELETE CASCADE,
  session_id     uuid          REFERENCES public.cash_sessions(id),
  amount         numeric(12,2) NOT NULL CHECK (amount > 0),
  method         text          NOT NULL DEFAULT 'cash'
                   CHECK (method IN ('cash', 'card', 'mobile_money')),
  note           text,
  paid_at        timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE public.hotel_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hp_member_all" ON public.hotel_payments;
CREATE POLICY "hp_member_all" ON public.hotel_payments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND business_id = hotel_payments.business_id
    )
  );

CREATE INDEX IF NOT EXISTS idx_hotel_payments_reservation ON public.hotel_payments (reservation_id);
CREATE INDEX IF NOT EXISTS idx_hotel_payments_session     ON public.hotel_payments (session_id);

-- 2. Storage bucket pour les logos d'établissements
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('business-logos', 'business-logos', true, 2097152, ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "logo_read_all"      ON storage.objects;
DROP POLICY IF EXISTS "logo_upload_member" ON storage.objects;
DROP POLICY IF EXISTS "logo_update_member" ON storage.objects;
DROP POLICY IF EXISTS "logo_delete_member" ON storage.objects;

CREATE POLICY "logo_read_all"      ON storage.objects FOR SELECT USING (bucket_id = 'business-logos');
CREATE POLICY "logo_upload_member" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'business-logos' AND auth.role() = 'authenticated');
CREATE POLICY "logo_update_member" ON storage.objects FOR UPDATE
  USING  (bucket_id = 'business-logos' AND auth.role() = 'authenticated');
CREATE POLICY "logo_delete_member" ON storage.objects FOR DELETE
  USING  (bucket_id = 'business-logos' AND auth.role() = 'authenticated');

-- 3. get_session_live_summary inclut les paiements hôtel
CREATE OR REPLACE FUNCTION public.get_session_live_summary(p_session_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_session      public.cash_sessions;
  v_result       json;
  v_h_cash       numeric(12,2) := 0;
  v_h_card       numeric(12,2) := 0;
  v_h_mobile     numeric(12,2) := 0;
  v_h_total      numeric(12,2) := 0;
BEGIN
  SELECT * INTO v_session FROM public.cash_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session introuvable.'; END IF;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE method = 'cash'),         0),
    COALESCE(SUM(amount) FILTER (WHERE method = 'card'),         0),
    COALESCE(SUM(amount) FILTER (WHERE method = 'mobile_money'), 0),
    COALESCE(SUM(amount), 0)
  INTO v_h_cash, v_h_card, v_h_mobile, v_h_total
  FROM public.hotel_payments
  WHERE session_id = p_session_id;

  SELECT json_build_object(
    'total_sales',   COALESCE(SUM(o.total), 0) + v_h_total,
    'total_cash',    COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'cash'),         0) + v_h_cash,
    'total_card',    COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'card'),         0) + v_h_card,
    'total_mobile',  COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'mobile_money'), 0) + v_h_mobile,
    'total_orders',  COUNT(DISTINCT o.id),
    'total_refunds', COALESCE((
      SELECT SUM(r.amount)
      FROM public.refunds r
      JOIN public.orders ord ON ord.id = r.order_id
      WHERE ord.business_id = v_session.business_id
        AND r.refunded_at >= v_session.opened_at
    ), 0)
  )
  INTO v_result
  FROM public.orders o
  JOIN public.payments p ON p.order_id = o.id
  WHERE o.business_id = v_session.business_id
    AND o.status = 'paid'
    AND o.created_at >= v_session.opened_at;

  RETURN v_result;
END;
$$;

-- 4. close_cash_session inclut les paiements hôtel
CREATE OR REPLACE FUNCTION public.close_cash_session(
  p_session_id  uuid,
  p_actual_cash numeric,
  p_notes       text DEFAULT NULL
)
RETURNS public.cash_sessions
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_session  public.cash_sessions;
  v_sales    numeric(12,2);
  v_cash     numeric(12,2);
  v_card     numeric(12,2);
  v_mobile   numeric(12,2);
  v_orders   integer;
  v_refunds  numeric(12,2);
  v_h_cash   numeric(12,2) := 0;
  v_h_card   numeric(12,2) := 0;
  v_h_mobile numeric(12,2) := 0;
  v_h_total  numeric(12,2) := 0;
BEGIN
  SELECT * INTO v_session
  FROM public.cash_sessions
  WHERE id = p_session_id AND status = 'open';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session introuvable ou déjà clôturée.';
  END IF;

  SELECT
    COALESCE(SUM(o.total), 0),
    COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'cash'),         0),
    COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'card'),         0),
    COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'mobile_money'), 0),
    COUNT(DISTINCT o.id)
  INTO v_sales, v_cash, v_card, v_mobile, v_orders
  FROM public.orders o
  JOIN public.payments p ON p.order_id = o.id
  WHERE o.business_id = v_session.business_id
    AND o.status = 'paid'
    AND o.created_at >= v_session.opened_at;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE method = 'cash'),         0),
    COALESCE(SUM(amount) FILTER (WHERE method = 'card'),         0),
    COALESCE(SUM(amount) FILTER (WHERE method = 'mobile_money'), 0),
    COALESCE(SUM(amount), 0)
  INTO v_h_cash, v_h_card, v_h_mobile, v_h_total
  FROM public.hotel_payments
  WHERE session_id = p_session_id;

  SELECT COALESCE(SUM(r.amount), 0)
  INTO v_refunds
  FROM public.refunds r
  JOIN public.orders o ON o.id = r.order_id
  WHERE o.business_id = v_session.business_id
    AND r.refunded_at >= v_session.opened_at;

  UPDATE public.cash_sessions SET
    status        = 'closed',
    closed_by     = auth.uid(),
    closed_at     = now(),
    total_sales   = v_sales + v_h_total,
    total_cash    = v_cash  + v_h_cash,
    total_card    = v_card  + v_h_card,
    total_mobile  = v_mobile + v_h_mobile,
    total_orders  = v_orders,
    total_refunds = v_refunds,
    expected_cash = v_session.opening_amount + v_cash + v_h_cash,
    actual_cash   = p_actual_cash,
    difference    = p_actual_cash - (v_session.opening_amount + v_cash + v_h_cash),
    notes         = p_notes
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  RETURN v_session;
END;
$$;


-- File: 046_whatsapp.sql
-- ============================================================
-- Migration 046 : WhatsApp Business Integration
-- ============================================================

-- Permettre les commandes sans caissier (commandes WhatsApp / externes)
ALTER TABLE orders ALTER COLUMN cashier_id DROP NOT NULL;

-- Source de la commande (pos, whatsapp, delivery, …)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'pos';

-- Config WhatsApp par établissement (un seul numéro par business)
CREATE TABLE IF NOT EXISTS whatsapp_configs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id     UUID NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  phone_number_id TEXT NOT NULL DEFAULT '',
  access_token    TEXT NOT NULL DEFAULT '',
  verify_token    TEXT NOT NULL DEFAULT encode(extensions.gen_random_bytes(16), 'hex'),
  display_phone   TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT false,
  catalog_enabled BOOLEAN NOT NULL DEFAULT false,
  welcome_message TEXT NOT NULL DEFAULT 'Bienvenue chez {nom} ! Tapez *menu* pour voir notre catalogue 🛍️',
  menu_keyword    TEXT NOT NULL DEFAULT 'menu',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Messages WhatsApp entrants et sortants
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  wa_message_id TEXT,
  from_phone    TEXT NOT NULL,
  from_name     TEXT,
  direction     TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type  TEXT NOT NULL DEFAULT 'text',
  body          TEXT,
  payload       JSONB,
  order_id      UUID REFERENCES orders(id),
  status        TEXT NOT NULL DEFAULT 'received',
  replied_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT whatsapp_messages_wa_id_unique UNIQUE (wa_message_id)
);

-- Paniers actifs pour le flux catalogue interactif
CREATE TABLE IF NOT EXISTS whatsapp_carts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  from_phone  TEXT NOT NULL,
  step        TEXT NOT NULL DEFAULT 'menu',
  items       JSONB NOT NULL DEFAULT '[]',
  context     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(business_id, from_phone)
);

-- Index
CREATE INDEX IF NOT EXISTS whatsapp_messages_biz_date_idx ON whatsapp_messages(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_messages_phone_idx    ON whatsapp_messages(business_id, from_phone);
CREATE INDEX IF NOT EXISTS whatsapp_carts_phone_idx       ON whatsapp_carts(business_id, from_phone);

-- RLS
ALTER TABLE whatsapp_configs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_carts    ENABLE ROW LEVEL SECURITY;

-- whatsapp_configs
DROP POLICY IF EXISTS "wacfg: manager read"  ON whatsapp_configs;
DROP POLICY IF EXISTS "wacfg: admin write"   ON whatsapp_configs;
DROP POLICY IF EXISTS "wacfg: service_role"  ON whatsapp_configs;

CREATE POLICY "wacfg: manager read"
  ON whatsapp_configs FOR SELECT
  USING (business_id IN (
    SELECT business_id FROM business_members
    WHERE user_id = auth.uid() AND role IN ('owner','admin','manager')
  ));

CREATE POLICY "wacfg: admin write"
  ON whatsapp_configs FOR ALL
  USING (business_id IN (
    SELECT business_id FROM business_members
    WHERE user_id = auth.uid() AND role IN ('owner','admin')
  ));

CREATE POLICY "wacfg: service_role"
  ON whatsapp_configs FOR ALL USING (auth.role() = 'service_role');

-- whatsapp_messages
DROP POLICY IF EXISTS "wamsg: members read"   ON whatsapp_messages;
DROP POLICY IF EXISTS "wamsg: members insert" ON whatsapp_messages;
DROP POLICY IF EXISTS "wamsg: members update" ON whatsapp_messages;
DROP POLICY IF EXISTS "wamsg: service_role"   ON whatsapp_messages;

CREATE POLICY "wamsg: members read"
  ON whatsapp_messages FOR SELECT
  USING (business_id IN (
    SELECT business_id FROM business_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "wamsg: members insert"
  ON whatsapp_messages FOR INSERT
  WITH CHECK (business_id IN (
    SELECT business_id FROM business_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "wamsg: members update"
  ON whatsapp_messages FOR UPDATE
  USING (business_id IN (
    SELECT business_id FROM business_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "wamsg: service_role"
  ON whatsapp_messages FOR ALL USING (auth.role() = 'service_role');

-- whatsapp_carts
DROP POLICY IF EXISTS "wacart: service_role" ON whatsapp_carts;

CREATE POLICY "wacart: service_role"
  ON whatsapp_carts FOR ALL USING (auth.role() = 'service_role');

-- Trigger updated_at sur whatsapp_configs
CREATE OR REPLACE FUNCTION update_whatsapp_config_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS whatsapp_configs_updated_at ON whatsapp_configs;
CREATE TRIGGER whatsapp_configs_updated_at
  BEFORE UPDATE ON whatsapp_configs
  FOR EACH ROW EXECUTE FUNCTION update_whatsapp_config_updated_at();


-- File: 047_whatsapp_menu_keyword.sql
-- Ajout colonne menu_keyword sur whatsapp_configs (migration corrective)
ALTER TABLE whatsapp_configs
  ADD COLUMN IF NOT EXISTS menu_keyword TEXT NOT NULL DEFAULT 'menu';


-- File: 048_whatsapp_confirm_message.sql
ALTER TABLE whatsapp_configs
  ADD COLUMN IF NOT EXISTS confirm_message TEXT NOT NULL DEFAULT
    '✅ *Commande confirmée !*\n\nVotre commande a bien été enregistrée. Notre équipe vous contactera pour la préparation ou la livraison.\n\nMerci de votre confiance ! 🙏\n\nPour une nouvelle commande, tapez *{mot_cle}*.';


-- File: 050_whatsapp_wave_url.sql
-- Lien de paiement Wave du marchand (optionnel)
-- Exemple : https://pay.wave.com/m/M_sn_8BA6UkixfXJl/c/sn/?
ALTER TABLE whatsapp_configs
  ADD COLUMN IF NOT EXISTS wave_payment_url TEXT;


-- File: 053_broadcast_logs.sql
-- Historique des envois broadcast WhatsApp pour éviter les doublons
CREATE TABLE IF NOT EXISTS whatsapp_broadcast_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  phone       TEXT NOT NULL,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, date, phone)
);

ALTER TABLE whatsapp_broadcast_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "broadcast_logs: members" ON whatsapp_broadcast_logs;
CREATE POLICY "broadcast_logs: members"
  ON whatsapp_broadcast_logs FOR ALL
  USING (business_id IN (
    SELECT business_id FROM business_members WHERE user_id = auth.uid()
  ));


-- File: 056_whatsapp_conversations_fn.sql
-- Fonction agrégée pour les conversations WhatsApp
-- Gère la normalisation des numéros (+prefix), pagination et recherche multi-critères
CREATE OR REPLACE FUNCTION get_whatsapp_conversations(
  p_business_id UUID,
  p_search      TEXT    DEFAULT NULL,
  p_unread_only BOOLEAN DEFAULT FALSE,
  p_limit       INT     DEFAULT 25,
  p_offset      INT     DEFAULT 0
)
RETURNS TABLE (
  from_phone   TEXT,
  from_name    TEXT,
  last_message TEXT,
  last_at      TIMESTAMPTZ,
  unread       BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH norm AS (
    -- Normalise le numéro : ajoute '+' si absent pour fusionner les doublons
    SELECT
      CASE WHEN from_phone LIKE '+%' THEN from_phone ELSE '+' || from_phone END AS nphone,
      from_name,
      body,
      created_at,
      direction,
      status,
      order_id
    FROM whatsapp_messages
    WHERE business_id = p_business_id
  ),
  latest_msg AS (
    -- Dernier message par contact (normalisé)
    SELECT DISTINCT ON (nphone)
      nphone,
      body        AS last_message,
      created_at  AS last_at
    FROM norm
    ORDER BY nphone, created_at DESC
  ),
  latest_name AS (
    -- Dernier nom connu par contact
    SELECT DISTINCT ON (nphone)
      nphone,
      from_name
    FROM norm
    WHERE from_name IS NOT NULL AND from_name <> ''
    ORDER BY nphone, created_at DESC
  ),
  unread AS (
    -- Comptage des messages non lus par contact
    SELECT nphone, COUNT(*) AS cnt
    FROM norm
    WHERE direction = 'inbound' AND status = 'received'
    GROUP BY nphone
  ),
  body_match AS (
    -- Contacts ayant au moins un message dont le contenu correspond à la recherche
    SELECT DISTINCT nphone
    FROM norm
    WHERE p_search IS NOT NULL AND p_search <> ''
      AND body ILIKE '%' || p_search || '%'
  ),
  order_match AS (
    -- Contacts ayant une commande dont l'UUID commence par la recherche
    -- ex: 'A20813F6' → order_id ILIKE 'a20813f6%'
    SELECT DISTINCT nphone
    FROM norm
    WHERE order_id IS NOT NULL
      AND p_search IS NOT NULL AND p_search <> ''
      AND order_id::TEXT ILIKE p_search || '%'
  )
  SELECT
    lm.nphone        AS from_phone,
    ln.from_name,
    lm.last_message,
    lm.last_at,
    COALESCE(u.cnt, 0) AS unread
  FROM latest_msg lm
  LEFT JOIN latest_name ln USING (nphone)
  LEFT JOIN unread u       USING (nphone)
  WHERE
    (
      p_search IS NULL OR p_search = '' OR
      lm.nphone        ILIKE '%' || p_search || '%' OR
      ln.from_name     ILIKE '%' || p_search || '%' OR
      lm.nphone IN (SELECT nphone FROM body_match)  OR
      lm.nphone IN (SELECT nphone FROM order_match)
    )
    AND (NOT p_unread_only OR COALESCE(u.cnt, 0) > 0)
  ORDER BY lm.last_at DESC
  -- +1 pour détecter s'il y a une page suivante
  LIMIT  p_limit + 1
  OFFSET p_offset;
$$;


-- File: 057_whatsapp_realtime.sql
-- Active Supabase Realtime pour whatsapp_messages
-- Nécessaire pour que les nouvelles conversations/messages s'affichent en temps réel
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'whatsapp_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_messages;
  END IF;
END $$;


-- File: 058_whatsapp_realtime_identity.sql
-- Pour que les filtres postgres_changes (business_id=eq.xxx) fonctionnent
-- sur des colonnes hors clé primaire, la table doit avoir REPLICA IDENTITY FULL.
-- Sans ça, Supabase Realtime ne peut pas évaluer le filtre et ne livre aucun événement.
ALTER TABLE whatsapp_messages REPLICA IDENTITY FULL;


-- File: 060_whatsapp_messages_config.sql
-- Messages B2C personnalisables pour chaque business
-- Les placeholders supportés :
--   {nom}      → nom de l'établissement
--   {mot_cle}  → mot-clé du menu
--   {commande} → ID court de la commande (8 chars)
--   {total}    → montant total de la commande

ALTER TABLE whatsapp_configs
  ADD COLUMN IF NOT EXISTS msg_cart_footer TEXT NOT NULL
    DEFAULT 'Tapez *confirmer* pour valider ou *menu* pour modifier.',
  ADD COLUMN IF NOT EXISTS msg_shipping_question TEXT NOT NULL
    DEFAULT '🚚 *Comment souhaitez-vous recevoir votre commande ?*',
  ADD COLUMN IF NOT EXISTS msg_address_request TEXT NOT NULL
    DEFAULT '📍 *Adresse de livraison*\n\nPartagez votre localisation 📌 ou tapez votre adresse en texte.\n\n_Tapez *annuler* pour revenir au menu._',
  ADD COLUMN IF NOT EXISTS msg_delivery_confirmation TEXT NOT NULL
    DEFAULT '✅ *Votre commande a été livrée !*\n\n📦 *Commande :* #{commande}\n💰 *Total :* {total} FCFA\n\nMerci pour votre confiance ! 🙏';


-- File: 072_tracking_module.sql
-- ─── Module de suivi terrain ─────────────────────────────────────────────────
INSERT INTO app_modules (id, label, description, icon, is_core, sort_order) VALUES
  ('tracking', 'Suivi terrain (GPS)', 'Tracking en temps réel de la position des membres de l''équipe sur le terrain', 'MapPin', false, 11)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order;

-- Par défaut, activé pour aucun type, doit être activé manuellement en backoffice


-- File: 074_staff.sql
-- ============================================================
-- 074 — Staff Management & Payroll
-- ============================================================

-- ── Employés ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS staff (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id    UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  phone          TEXT,
  email          TEXT,
  position       TEXT,          -- Poste (ex: Caissier, Serveur, Manager)
  department     TEXT,          -- Département (ex: Cuisine, Salle, Admin)
  salary_type    TEXT NOT NULL DEFAULT 'monthly'
                   CHECK (salary_type IN ('hourly', 'daily', 'monthly')),
  salary_rate    NUMERIC(12,2) NOT NULL DEFAULT 0,
  hire_date      DATE,
  status         TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'inactive')),
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── Présences ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS staff_attendance (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id      UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'present'
                  CHECK (status IN ('present', 'absent', 'half_day', 'leave', 'holiday')),
  clock_in      TIME,
  clock_out     TIME,
  hours_worked  NUMERIC(5,2),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (staff_id, date)
);

-- ── Paiements ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS staff_payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id        UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  base_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  bonuses         NUMERIC(12,2) NOT NULL DEFAULT 0,
  deductions      NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  days_worked     NUMERIC(5,1),
  hours_worked    NUMERIC(6,2),
  payment_method  TEXT DEFAULT 'cash'
                    CHECK (payment_method IN ('cash', 'transfer', 'mobile_money', 'check')),
  payment_date    DATE,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'paid')),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS staff_business_id_idx             ON staff(business_id);
CREATE INDEX IF NOT EXISTS staff_status_idx                  ON staff(business_id, status);
CREATE INDEX IF NOT EXISTS staff_attendance_staff_date_idx   ON staff_attendance(staff_id, date);
CREATE INDEX IF NOT EXISTS staff_attendance_biz_month_idx    ON staff_attendance(business_id, date);
CREATE INDEX IF NOT EXISTS staff_payments_staff_id_idx       ON staff_payments(staff_id);
CREATE INDEX IF NOT EXISTS staff_payments_business_period_idx ON staff_payments(business_id, period_start);

-- ── RLS ───────────────────────────────────────────────────────

ALTER TABLE staff            ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_payments   ENABLE ROW LEVEL SECURITY;

-- staff
DROP POLICY IF EXISTS "staff: members can read"   ON staff;
DROP POLICY IF EXISTS "staff: members can insert" ON staff;
DROP POLICY IF EXISTS "staff: members can update" ON staff;
DROP POLICY IF EXISTS "staff: members can delete" ON staff;

CREATE POLICY "staff: members can read"
  ON staff FOR SELECT
  USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "staff: members can insert"
  ON staff FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "staff: members can update"
  ON staff FOR UPDATE
  USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "staff: members can delete"
  ON staff FOR DELETE
  USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

-- staff_attendance
DROP POLICY IF EXISTS "attendance: members can read"   ON staff_attendance;
DROP POLICY IF EXISTS "attendance: members can insert" ON staff_attendance;
DROP POLICY IF EXISTS "attendance: members can update" ON staff_attendance;
DROP POLICY IF EXISTS "attendance: members can delete" ON staff_attendance;

CREATE POLICY "attendance: members can read"
  ON staff_attendance FOR SELECT
  USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "attendance: members can insert"
  ON staff_attendance FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "attendance: members can update"
  ON staff_attendance FOR UPDATE
  USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "attendance: members can delete"
  ON staff_attendance FOR DELETE
  USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

-- staff_payments
DROP POLICY IF EXISTS "staff_payments: members can read"   ON staff_payments;
DROP POLICY IF EXISTS "staff_payments: members can insert" ON staff_payments;
DROP POLICY IF EXISTS "staff_payments: members can update" ON staff_payments;
DROP POLICY IF EXISTS "staff_payments: members can delete" ON staff_payments;

CREATE POLICY "staff_payments: members can read"
  ON staff_payments FOR SELECT
  USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "staff_payments: members can insert"
  ON staff_payments FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "staff_payments: members can update"
  ON staff_payments FOR UPDATE
  USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "staff_payments: members can delete"
  ON staff_payments FOR DELETE
  USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));


-- File: 075_staff_user_link.sql
-- ============================================================
-- 075 — Lien staff ↔ compte utilisateur système
-- ============================================================

-- Colonne optionnelle : quand un employé a un compte de connexion
ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Un compte utilisateur ne peut être lié qu'à un seul employé par business
CREATE UNIQUE INDEX IF NOT EXISTS staff_user_id_unique
  ON staff(user_id)
  WHERE user_id IS NOT NULL;


-- File: 076_hotel_room_charge.sql
-- ============================================================
-- ELM APP — Charge to Room Integration
-- ============================================================

-- 1. Link orders to hotel reservations
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS hotel_reservation_id UUID REFERENCES hotel_reservations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_hotel_reservation ON orders(hotel_reservation_id);

-- 2. Link hotel services to orders (to track source of charge)
ALTER TABLE hotel_services
ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_hotel_services_order ON hotel_services(order_id);

-- 3. Update payment methods to include room_charge
ALTER TABLE payments 
DROP CONSTRAINT IF EXISTS payments_method_check;

ALTER TABLE payments 
ADD CONSTRAINT payments_method_check 
CHECK (method IN ('cash', 'card', 'mobile_money', 'partial', 'room_charge', 'free'));

-- 4. Update create_order to handle hotel_reservation_id and room_charge
CREATE OR REPLACE FUNCTION create_order(order_data JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order_id   UUID;
  v_order      JSONB;
  v_item       JSONB;
  v_payment    JSONB;
  v_coupon_id  UUID;
  v_status     TEXT;
  v_pay_method TEXT;
  v_hotel_res_id UUID;
BEGIN
  v_pay_method   := order_data->'payment'->>'method';
  v_hotel_res_id := NULLIF(order_data->>'hotel_reservation_id', '')::UUID;

  IF v_pay_method = 'partial' THEN
    v_status := 'pending';
  ELSE
    v_status := 'paid';
  END IF;

  INSERT INTO orders (
    business_id, cashier_id, status,
    subtotal, tax_amount, discount_amount, total,
    coupon_id, coupon_code, coupon_notes, notes,
    coupon_ids, coupon_codes,
    customer_name, customer_phone,
    hotel_reservation_id
  )
  VALUES (
    (order_data->>'business_id')::UUID,
    (order_data->>'cashier_id')::UUID,
    v_status,
    (order_data->>'subtotal')::NUMERIC,
    (order_data->>'tax_amount')::NUMERIC,
    (order_data->>'discount_amount')::NUMERIC,
    (order_data->>'total')::NUMERIC,
    NULLIF(order_data->>'coupon_id', '')::UUID,
    order_data->>'coupon_code',
    order_data->>'coupon_notes',
    order_data->>'notes',
    COALESCE(order_data->'coupon_ids', '[]'::JSONB),
    COALESCE(order_data->'coupon_codes', '[]'::JSONB),
    order_data->>'customer_name',
    order_data->>'customer_phone',
    v_hotel_res_id
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(order_data->'items')
  LOOP
    INSERT INTO order_items (
      order_id, product_id, variant_id, name,
      price, quantity, discount_amount, total, notes
    )
    VALUES (
      v_order_id,
      (v_item->>'product_id')::UUID,
      NULLIF(v_item->>'variant_id', '')::UUID,
      v_item->>'name',
      (v_item->>'price')::NUMERIC,
      (v_item->>'quantity')::INTEGER,
      COALESCE((v_item->>'discount_amount')::NUMERIC, 0),
      (v_item->>'total')::NUMERIC,
      v_item->>'notes'
    );

    PERFORM decrement_stock(
      (v_item->>'product_id')::UUID,
      (v_item->>'quantity')::INTEGER
    );
  END LOOP;

  IF jsonb_array_length(COALESCE(order_data->'payments', '[]'::JSONB)) > 0 THEN
    FOR v_payment IN SELECT * FROM jsonb_array_elements(order_data->'payments')
    LOOP
      INSERT INTO payments (order_id, method, amount)
      VALUES (v_order_id, v_payment->>'method', (v_payment->>'amount')::NUMERIC);
      
      -- If any payment is room_charge, link it
      IF v_payment->>'method' = 'room_charge' AND v_hotel_res_id IS NOT NULL THEN
        INSERT INTO hotel_services (business_id, reservation_id, order_id, label, amount, service_date)
        VALUES (
          (order_data->>'business_id')::UUID,
          v_hotel_res_id,
          v_order_id,
          'Restaurant/Bar Order #' || v_order_id,
          (v_payment->>'amount')::NUMERIC,
          NOW()
        );
      END IF;
    END LOOP;
  ELSE
    INSERT INTO payments (order_id, method, amount, reference)
    VALUES (
      v_order_id,
      v_pay_method,
      (order_data->'payment'->>'amount')::NUMERIC,
      order_data->'payment'->>'reference'
    );

    -- If room_charge, link it
    IF v_pay_method = 'room_charge' AND v_hotel_res_id IS NOT NULL THEN
      INSERT INTO hotel_services (business_id, reservation_id, order_id, label, amount, service_date)
      VALUES (
        (order_data->>'business_id')::UUID,
        v_hotel_res_id,
        v_order_id,
        'Restaurant/Bar Order #' || v_order_id,
        (order_data->'payment'->>'amount')::NUMERIC,
        NOW()
      );
    END IF;
  END IF;

  FOR v_coupon_id IN
    SELECT (value #>> '{}')::UUID
    FROM jsonb_array_elements(COALESCE(order_data->'coupon_ids', '[]'::JSONB))
  LOOP
    PERFORM increment_coupon_uses(v_coupon_id);
  END LOOP;

  SELECT to_jsonb(o.*) INTO v_order FROM orders o WHERE o.id = v_order_id;
  RETURN v_order;
END;
$$;


-- File: 077_restaurant_table_management.sql
-- ============================================================
-- ELM APP — Restaurant Table Management & Floor Plan
-- ============================================================

-- 1. Floors / Areas (Main Hall, Terrace, etc.)
CREATE TABLE IF NOT EXISTS restaurant_floors (
  id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id  UUID         NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name         TEXT         NOT NULL,
  position     INTEGER      DEFAULT 0,
  is_active    BOOLEAN      DEFAULT true,
  created_at   TIMESTAMPTZ  DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  DEFAULT NOW()
);

-- 2. Tables
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'table_shape') THEN
    CREATE TYPE table_shape AS ENUM ('square', 'round', 'rectangle');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'table_status') THEN
    CREATE TYPE table_status AS ENUM ('free', 'occupied', 'reserved', 'cleaning');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS restaurant_tables (
  id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id  UUID         NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  floor_id     UUID         NOT NULL REFERENCES restaurant_floors(id) ON DELETE CASCADE,
  name         TEXT         NOT NULL,
  capacity     INTEGER      DEFAULT 2,
  shape        table_shape  DEFAULT 'square',
  
  -- Position for visual map (0-100 percentage or grid coords)
  pos_x        INTEGER      DEFAULT 0,
  pos_y        INTEGER      DEFAULT 0,
  width        INTEGER      DEFAULT 60,
  height       INTEGER      DEFAULT 60,
  rotation     INTEGER      DEFAULT 0,
  
  status       table_status DEFAULT 'free',
  current_order_id UUID, -- NULL if free
  
  is_active    BOOLEAN      DEFAULT true,
  created_at   TIMESTAMPTZ  DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  DEFAULT NOW()
);

-- 3. Link orders to tables
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS table_id UUID REFERENCES restaurant_tables(id) ON DELETE SET NULL;

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_tables_business ON restaurant_tables(business_id);
CREATE INDEX IF NOT EXISTS idx_tables_floor ON restaurant_tables(floor_id);
CREATE INDEX IF NOT EXISTS idx_orders_table ON orders(table_id);

-- 5. RLS
ALTER TABLE restaurant_floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "floors_select" ON restaurant_floors;
DROP POLICY IF EXISTS "floors_manage" ON restaurant_floors;
CREATE POLICY "floors_select" ON restaurant_floors FOR SELECT USING (business_id = get_user_business_id());
CREATE POLICY "floors_manage" ON restaurant_floors FOR ALL USING (business_id = get_user_business_id() AND get_user_role() IN ('admin','owner','manager'));

DROP POLICY IF EXISTS "tables_select" ON restaurant_tables;
DROP POLICY IF EXISTS "tables_manage" ON restaurant_tables;
CREATE POLICY "tables_select" ON restaurant_tables FOR SELECT USING (business_id = get_user_business_id());
CREATE POLICY "tables_manage" ON restaurant_tables FOR ALL USING (business_id = get_user_business_id() AND get_user_role() IN ('admin','owner','manager'));

-- 6. Trigger to update table status when an order is created
CREATE OR REPLACE FUNCTION update_table_status_on_order()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.table_id IS NOT NULL AND NEW.status = 'pending') THEN
    UPDATE restaurant_tables SET status = 'occupied', current_order_id = NEW.id WHERE id = NEW.table_id;
  ELSIF (OLD.table_id IS NOT NULL AND (NEW.status = 'paid' OR NEW.status = 'cancelled')) THEN
    UPDATE restaurant_tables SET status = 'cleaning', current_order_id = NULL WHERE id = OLD.table_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_update_table_status ON orders;
CREATE TRIGGER tr_update_table_status
AFTER INSERT OR UPDATE OF status, table_id ON orders
FOR EACH ROW EXECUTE FUNCTION update_table_status_on_order();


-- File: 082_workflow_builder.sql
-- ─── Legal Workflow Builder ───────────────────────────────────────────────────
-- Migration 082 : workflows, instances, history

-- ─── workflows ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflows (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  description TEXT,
  definition  JSONB       NOT NULL DEFAULT '{"nodes":[],"edges":[],"initial_node_id":""}',
  version     INT         NOT NULL DEFAULT 1,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_by  UUID        REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── workflow_instances ───────────────────────────────────────────────────────
-- workflow_snapshot garantit l'immutabilité : même si la définition change,
-- les dossiers en cours continuent sur la version qu'ils ont commencée.
CREATE TABLE IF NOT EXISTS workflow_instances (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id          UUID        NOT NULL,   -- référence externe (dossiers juridiques)
  workflow_id         UUID        NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  workflow_version    INT         NOT NULL,   -- version au moment du démarrage
  workflow_snapshot   JSONB       NOT NULL,   -- copie complète de la définition
  current_node_id     TEXT        NOT NULL,
  context             JSONB       NOT NULL DEFAULT '{}',
  status              TEXT        NOT NULL DEFAULT 'RUNNING'
                        CHECK (status IN ('RUNNING', 'WAITING', 'COMPLETED', 'CANCELLED')),
  started_by          UUID        REFERENCES auth.users(id),
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure CASCADE for existing tables
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'workflow_instances_workflow_id_fkey' 
    AND table_name = 'workflow_instances'
  ) THEN
    ALTER TABLE workflow_instances DROP CONSTRAINT workflow_instances_workflow_id_fkey;
    ALTER TABLE workflow_instances ADD CONSTRAINT workflow_instances_workflow_id_fkey 
      FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_workflow_instances_dossier   ON workflow_instances(dossier_id);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_status    ON workflow_instances(status);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_workflow   ON workflow_instances(workflow_id);

-- ─── workflow_history ─────────────────────────────────────────────────────────
-- Audit trail immuable : on n'update jamais, on append uniquement.
CREATE TABLE IF NOT EXISTS workflow_history (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id      UUID        NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  from_node_id     TEXT,                 -- NULL pour la transition initiale
  to_node_id       TEXT        NOT NULL,
  edge_id          TEXT,
  action_label     TEXT,
  context_snapshot JSONB       NOT NULL, -- état du contexte au moment de la transition
  performed_by     UUID        REFERENCES auth.users(id),
  performed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata         JSONB       NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_workflow_history_instance ON workflow_history(instance_id);
CREATE INDEX IF NOT EXISTS idx_workflow_history_time     ON workflow_history(performed_at DESC);

-- ─── Trigger updated_at ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS workflows_updated_at ON workflows;
CREATE TRIGGER workflows_updated_at
  BEFORE UPDATE ON workflows
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS workflow_instances_updated_at ON workflow_instances;
CREATE TRIGGER workflow_instances_updated_at
  BEFORE UPDATE ON workflow_instances
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE workflows          ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_history   ENABLE ROW LEVEL SECURITY;

-- Les membres du business peuvent lire les workflows actifs
DROP POLICY IF EXISTS "read workflows" ON workflows;
CREATE POLICY "read workflows" ON workflows
  FOR SELECT TO authenticated
  USING (
    business_id IN (
      SELECT business_id FROM business_members WHERE user_id = auth.uid()
    )
  );

-- Seul un manager/owner peut créer ou modifier
DROP POLICY IF EXISTS "manage workflows" ON workflows;
CREATE POLICY "manage workflows" ON workflows
  FOR ALL TO authenticated
  USING (
    business_id IN (
      SELECT business_id FROM business_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'manager', 'admin')
    )
  )
  WITH CHECK (
    business_id IN (
      SELECT business_id FROM business_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'manager', 'admin')
    )
  );

-- Les membres du business peuvent lire et créer des instances
DROP POLICY IF EXISTS "read workflow_instances" ON workflow_instances;
CREATE POLICY "read workflow_instances" ON workflow_instances
  FOR SELECT TO authenticated
  USING (
    workflow_id IN (
      SELECT id FROM workflows WHERE business_id IN (
        SELECT business_id FROM business_members WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "manage workflow_instances" ON workflow_instances;
CREATE POLICY "manage workflow_instances" ON workflow_instances
  FOR ALL TO authenticated
  USING (
    workflow_id IN (
      SELECT id FROM workflows WHERE business_id IN (
        SELECT business_id FROM business_members WHERE user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    workflow_id IN (
      SELECT id FROM workflows WHERE business_id IN (
        SELECT business_id FROM business_members WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "read workflow_history" ON workflow_history;
CREATE POLICY "read workflow_history" ON workflow_history
  FOR SELECT TO authenticated
  USING (
    instance_id IN (
      SELECT id FROM workflow_instances WHERE workflow_id IN (
        SELECT id FROM workflows WHERE business_id IN (
          SELECT business_id FROM business_members WHERE user_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "insert workflow_history" ON workflow_history;
CREATE POLICY "insert workflow_history" ON workflow_history
  FOR INSERT TO authenticated
  WITH CHECK (
    instance_id IN (
      SELECT id FROM workflow_instances WHERE workflow_id IN (
        SELECT id FROM workflows WHERE business_id IN (
          SELECT business_id FROM business_members WHERE user_id = auth.uid()
        )
      )
    )
  );


-- File: 083_workflow_v2.sql
-- ─── Workflow Engine v2 ───────────────────────────────────────────────────────
-- Migration 083 : amélioration instances, queue, pretentions, tracking

-- ─── workflow_instances : nouveaux champs ─────────────────────────────────────
ALTER TABLE workflow_instances
  ADD COLUMN IF NOT EXISTS retry_count          INT         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error           TEXT,
  ADD COLUMN IF NOT EXISTS paused_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_resume_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS triggered_by         TEXT;       -- 'ON_DOSSIER_CREATE' | 'MANUAL' | etc.

-- Étendre les statuts (PENDING et FAILED manquaient)
ALTER TABLE workflow_instances
  DROP CONSTRAINT IF EXISTS workflow_instances_status_check;
ALTER TABLE workflow_instances
  ADD  CONSTRAINT workflow_instances_status_check
  CHECK (status IN ('PENDING','RUNNING','WAITING','COMPLETED','FAILED','PAUSED','CANCELLED'));

-- ─── workflow_logs : audit enrichi (remplace workflow_history) ────────────────
CREATE TABLE IF NOT EXISTS workflow_logs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id      UUID        NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  level            TEXT        NOT NULL DEFAULT 'INFO'
                     CHECK (level IN ('DEBUG','INFO','WARN','ERROR')),
  event_type       TEXT        NOT NULL,
    -- TRANSITION | ACTION_EXEC | ERROR | RETRY | PAUSE | RESUME | TRIGGER
  from_node_id     TEXT,
  to_node_id       TEXT,
  edge_id          TEXT,
  message          TEXT,
  context_snapshot JSONB       NOT NULL DEFAULT '{}',
  error_details    JSONB,
  performed_by     UUID        REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wlogs_instance ON workflow_logs(instance_id);
CREATE INDEX IF NOT EXISTS idx_wlogs_time     ON workflow_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wlogs_errors   ON workflow_logs(instance_id) WHERE level = 'ERROR';

-- ─── workflow_jobs : queue asynchrone (pattern BullMQ sur Supabase) ───────────
CREATE TABLE IF NOT EXISTS workflow_jobs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id   UUID        NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  job_type      TEXT        NOT NULL,
    -- PROCESS_NODE | SEND_NOTIFICATION | GENERATE_DOC | CALL_WEBHOOK | RESUME_DELAY
  payload       JSONB       NOT NULL DEFAULT '{}',
  status        TEXT        NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING','PROCESSING','DONE','FAILED')),
  priority      INT         NOT NULL DEFAULT 5,  -- 1 (haute) → 10 (basse)
  retry_count   INT         NOT NULL DEFAULT 0,
  max_retries   INT         NOT NULL DEFAULT 3,
  last_error    TEXT,
  process_after TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_wjobs_pending  ON workflow_jobs(process_after, priority)
  WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_wjobs_instance ON workflow_jobs(instance_id);

-- ─── pretentions : bibliothèque de blocs juridiques réutilisables ─────────────
CREATE TABLE IF NOT EXISTS pretentions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  category    TEXT,          -- 'mise_en_demeure' | 'relance' | 'assignation' | ...
  description TEXT,
  template    TEXT        NOT NULL,  -- texte juridique avec {{variables}}
  variables   JSONB       NOT NULL DEFAULT '[]',
    -- [{ "key": "nom_client", "label": "Nom du client", "type": "text", "required": true }]
  tags        TEXT[]      NOT NULL DEFAULT '{}',
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_by  UUID        REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pretentions_business  ON pretentions(business_id);
CREATE INDEX IF NOT EXISTS idx_pretentions_category  ON pretentions(business_id, category);

-- ─── workflow_triggers ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_triggers (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id  UUID        NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  trigger_type TEXT        NOT NULL
    CHECK (trigger_type IN ('ON_DOSSIER_CREATE','ON_STEP_CHANGE','TIMER','EXTERNAL_EVENT')),
  config       JSONB       NOT NULL DEFAULT '{}',
    -- TIMER  : { "cron": "0 9 * * 1" }
    -- TIMER  : { "delay_hours": 48 }
    -- EXTERNAL_EVENT : { "event_key": "whatsapp_reply" }
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── workflow_documents : fichiers générés ────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_documents (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id  UUID        NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  node_id      TEXT        NOT NULL,
  name         TEXT        NOT NULL,
  storage_path TEXT        NOT NULL,  -- chemin Supabase Storage
  mime_type    TEXT        NOT NULL DEFAULT 'application/pdf',
  size_bytes   BIGINT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by UUID        REFERENCES auth.users(id)
);

-- ─── client_tracking_tokens : suivi client sécurisé ──────────────────────────
CREATE TABLE IF NOT EXISTS client_tracking_tokens (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token        TEXT        NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  dossier_id   UUID        NOT NULL,
  instance_id  UUID        REFERENCES workflow_instances(id) ON DELETE SET NULL,
  client_phone TEXT,
  client_email TEXT,
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  last_viewed  TIMESTAMPTZ,
  view_count   INT         NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tracking_token   ON client_tracking_tokens(token);
CREATE INDEX IF NOT EXISTS idx_tracking_dossier ON client_tracking_tokens(dossier_id);

-- ─── Trigger updated_at pour pretentions ──────────────────────────────────────
DROP TRIGGER IF EXISTS pretentions_updated_at ON pretentions;
CREATE TRIGGER pretentions_updated_at
  BEFORE UPDATE ON pretentions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE workflow_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_jobs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pretentions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_documents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_tracking_tokens ENABLE ROW LEVEL SECURITY;

-- workflow_logs
DROP POLICY IF EXISTS "read workflow_logs"   ON workflow_logs;
DROP POLICY IF EXISTS "insert workflow_logs" ON workflow_logs;
CREATE POLICY "read workflow_logs" ON workflow_logs FOR SELECT TO authenticated USING (
  instance_id IN (SELECT id FROM workflow_instances WHERE workflow_id IN (
    SELECT id FROM workflows WHERE business_id IN (
      SELECT business_id FROM business_members WHERE user_id = auth.uid()
    )
  ))
);
CREATE POLICY "insert workflow_logs" ON workflow_logs FOR INSERT TO authenticated WITH CHECK (
  instance_id IN (SELECT id FROM workflow_instances WHERE workflow_id IN (
    SELECT id FROM workflows WHERE business_id IN (
      SELECT business_id FROM business_members WHERE user_id = auth.uid()
    )
  ))
);

-- workflow_jobs
DROP POLICY IF EXISTS "manage workflow_jobs" ON workflow_jobs;
CREATE POLICY "manage workflow_jobs" ON workflow_jobs FOR ALL TO authenticated
  USING (instance_id IN (SELECT id FROM workflow_instances WHERE workflow_id IN (
    SELECT id FROM workflows WHERE business_id IN (
      SELECT business_id FROM business_members WHERE user_id = auth.uid()
    )
  )))
  WITH CHECK (instance_id IN (SELECT id FROM workflow_instances WHERE workflow_id IN (
    SELECT id FROM workflows WHERE business_id IN (
      SELECT business_id FROM business_members WHERE user_id = auth.uid()
    )
  )));

-- pretentions
DROP POLICY IF EXISTS "read pretentions"   ON pretentions;
DROP POLICY IF EXISTS "manage pretentions" ON pretentions;
CREATE POLICY "read pretentions" ON pretentions FOR SELECT TO authenticated
  USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));
CREATE POLICY "manage pretentions" ON pretentions FOR ALL TO authenticated
  USING (business_id IN (
    SELECT business_id FROM business_members WHERE user_id = auth.uid() AND role IN ('owner','manager','admin')
  ))
  WITH CHECK (business_id IN (
    SELECT business_id FROM business_members WHERE user_id = auth.uid() AND role IN ('owner','manager','admin')
  ));

-- workflow_documents
DROP POLICY IF EXISTS "read workflow_documents" ON workflow_documents;
CREATE POLICY "read workflow_documents" ON workflow_documents FOR SELECT TO authenticated USING (
  instance_id IN (SELECT id FROM workflow_instances WHERE workflow_id IN (
    SELECT id FROM workflows WHERE business_id IN (
      SELECT business_id FROM business_members WHERE user_id = auth.uid()
    )
  ))
);

-- client_tracking_tokens : lecture publique via token valide
DROP POLICY IF EXISTS "public view tracking"   ON client_tracking_tokens;
DROP POLICY IF EXISTS "manage tracking tokens" ON client_tracking_tokens;
CREATE POLICY "public view tracking" ON client_tracking_tokens
  FOR SELECT USING (expires_at > now());
CREATE POLICY "manage tracking tokens" ON client_tracking_tokens FOR ALL TO authenticated
  USING (dossier_id IN (
    -- vérification par dossier_id si tu as une table dossiers
    -- sinon, autoriser tous les membres authentifiés
    SELECT gen_random_uuid() WHERE true  -- placeholder : adapter à ta table dossiers
  ));


-- File: 084_workflow_cron.sql
-- ─── Workflow Cron Migration ──────────────────────────────────────────────────
-- Enable pg_net for HTTP requests from Postgres (to call Edge Functions)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Note: pg_cron is usually already enabled on Supabase.
-- If not, it can be enabled via the dashboard.

-- Function to trigger the workflow processor
-- This allows scheduling via pg_cron without repeating the HTTP config
CREATE OR REPLACE FUNCTION public.invoke_workflow_processor()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- This is a placeholder. In production, you should use your project URL and service_role key.
  -- Alternatively, use the Supabase Dashboard -> Cron Jobs which is easier to manage.
  PERFORM net.http_post(
    url := (SELECT value FROM (SELECT current_setting('app.settings.supabase_url', true) AS value) s WHERE value IS NOT NULL) || '/functions/v1/workflow-processor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM (SELECT current_setting('app.settings.service_role_key', true) AS value) s WHERE value IS NOT NULL)
    )
  );
END;
$$;

-- Schedule the cron job if pg_cron is available
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unscheduling previous if exists (to avoid duplicates if migration is rerun)
    PERFORM cron.unschedule('workflow-processor-cron');
    
    PERFORM cron.schedule(
      'workflow-processor-cron',
      '*/5 * * * *',
      'SELECT public.invoke_workflow_processor()'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;


-- File: 089_tracking_view_rpc.sql
-- ─── Fonction RPC pour incrémenter les vues de suivi ──────────────────────────
-- Migration 089 : Statistiques de consultation du lien de suivi.

CREATE OR REPLACE FUNCTION public.increment_tracking_view(t text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.client_tracking_tokens
  SET 
    view_count = view_count + 1,
    last_viewed = now()
  WHERE token = t;
END;
$$;

-- Accès public à la fonction (nécessaire pour le suivi client sans auth)
GRANT EXECUTE ON FUNCTION public.increment_tracking_view(text) TO anon;
GRANT EXECUTE ON FUNCTION public.increment_tracking_view(text) TO authenticated;


-- File: 090_workflow_optimistic_locking.sql
-- ─── Optimistic Locking pour les instances de workflow ─────────────────────────
-- Ajout de la colonne version pour éviter les race conditions lors des updates.

ALTER TABLE workflow_instances ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

COMMENT ON COLUMN workflow_instances.version IS 'Version de l''instance pour optimistic locking';


-- File: 092_fix_tracking_rls.sql
-- ─── Fix RLS pour les tokens de tracking ──────────────────────────────────────
-- Corrige le placeholder par une vérification réelle via la table dossiers.

DROP POLICY IF EXISTS "manage tracking tokens" ON client_tracking_tokens;

CREATE POLICY "manage tracking tokens" ON client_tracking_tokens 
FOR ALL TO authenticated
USING (
  dossier_id IN (
    SELECT id FROM dossiers 
    WHERE business_id IN (
      SELECT business_id FROM business_members WHERE user_id = auth.uid()
      UNION SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  )
)
WITH CHECK (
  dossier_id IN (
    SELECT id FROM dossiers 
    WHERE business_id IN (
      SELECT business_id FROM business_members WHERE user_id = auth.uid()
      UNION SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  )
);

COMMENT ON POLICY "manage tracking tokens" ON client_tracking_tokens 
IS 'Permet aux membres du business de gérer les tokens de tracking liés à leurs dossiers';
