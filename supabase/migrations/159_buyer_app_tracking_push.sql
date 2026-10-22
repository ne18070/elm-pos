-- App acheteur « ELM Boutique » (buyer_app/) : suivi des demandes de service,
-- notifications push (Firebase Cloud Messaging) et distribution de l'APK Android.
--
-- 1. create_public_service_order :
--    - prix et noms relus dans service_catalog (le client ne fixe plus le prix : avant,
--      une demande à 0 FCFA pouvait être créée en appelant l'API directement) ;
--    - crée le jeton de suivi (client_tracking_tokens) et le renvoie : l'app et la page
--      web peuvent suivre la demande tout de suite (/track/<jeton>).
-- 2. client_push_devices + register_push_device() : téléphones abonnés aux notifications
--    d'un suivi. Envoi côté serveur par /api/client-push/notify (renderer/lib/fcm.ts).
-- 3. Bucket public app-releases : APK Android + latest.json, déposés par la CI
--    (.github/workflows/mobile-android.yml), servis par la page /telecharger.

-- ── 1. Demande de service publique ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_public_service_order(
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
  v_order record;
  v_total numeric := 0;
  v_count int;
  v_token text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM businesses WHERE id = p_business_id) THEN
    RAISE EXCEPTION 'Établissement introuvable';
  END IF;
  IF nullif(trim(coalesce(p_client_name, '')), '') IS NULL
     OR nullif(trim(coalesce(p_client_phone, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Nom et téléphone obligatoires';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Choisissez au moins une prestation';
  END IF;

  -- Lignes validées contre le catalogue de l'établissement (prix et nom du catalogue)
  SELECT count(*), coalesce(sum(s.price * q.quantity), 0)
  INTO v_count, v_total
  FROM jsonb_array_elements(p_items) AS item
  CROSS JOIN LATERAL (SELECT least(greatest(coalesce((item->>'quantity')::int, 1), 1), 99) AS quantity) q
  JOIN service_catalog s
    ON s.id = nullif(item->>'service_id', '')::uuid
   AND s.business_id = p_business_id
   AND s.is_active;

  IF v_count <> jsonb_array_length(p_items) THEN
    RAISE EXCEPTION 'Une prestation n''est plus disponible. Actualisez le catalogue.';
  END IF;

  INSERT INTO service_orders (
    business_id, subject_ref, subject_type, subject_info,
    client_name, client_phone, notes, total, paid_amount, status, source
  )
  VALUES (
    p_business_id,
    nullif(trim(coalesce(p_subject_ref,  '')), ''),
    coalesce(nullif(trim(p_subject_type), ''), 'autre'),
    nullif(trim(coalesce(p_subject_info, '')), ''),
    trim(p_client_name),
    trim(p_client_phone),
    nullif(trim(coalesce(p_notes, '')), ''),
    v_total,
    0,
    'attente',
    'public'
  )
  RETURNING * INTO v_order;

  INSERT INTO service_order_items (order_id, service_id, name, price, quantity, total)
  SELECT v_order.id, s.id, s.name, s.price, q.quantity, s.price * q.quantity
  FROM jsonb_array_elements(p_items) AS item
  CROSS JOIN LATERAL (SELECT least(greatest(coalesce((item->>'quantity')::int, 1), 1), 99) AS quantity) q
  JOIN service_catalog s
    ON s.id = nullif(item->>'service_id', '')::uuid
   AND s.business_id = p_business_id
   AND s.is_active;

  -- Jeton de suivi (même format que getOrCreateTrackingToken côté dashboard)
  INSERT INTO client_tracking_tokens (service_order_id, client_phone, expires_at)
  VALUES (v_order.id, trim(p_client_phone), now() + INTERVAL '90 days')
  RETURNING token INTO v_token;

  RETURN jsonb_build_object(
    'id',             v_order.id,
    'order_number',   v_order.order_number,
    'status',         v_order.status,
    'total',          v_total,
    'tracking_token', v_token
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_public_service_order(uuid, text, text, text, text, text, text, jsonb)
  TO anon, authenticated, service_role;

-- ── 2. Appareils abonnés aux notifications ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_push_devices (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_token TEXT        NOT NULL REFERENCES public.client_tracking_tokens(token) ON DELETE CASCADE,
  fcm_token      TEXT        NOT NULL,
  platform       TEXT        NOT NULL CHECK (platform IN ('android', 'ios')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tracking_token, fcm_token)
);

CREATE INDEX IF NOT EXISTS idx_client_push_devices_token ON public.client_push_devices(tracking_token);

-- Aucune policy : accès uniquement via register_push_device() et la clé service (envoi)
ALTER TABLE public.client_push_devices ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.client_push_devices TO authenticated;
GRANT ALL ON TABLE public.client_push_devices TO service_role;

CREATE OR REPLACE FUNCTION public.register_push_device(
  p_tracking_token TEXT,
  p_fcm_token      TEXT,
  p_platform       TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_platform NOT IN ('android', 'ios') OR length(coalesce(p_fcm_token, '')) < 20 THEN
    RAISE EXCEPTION 'Appareil invalide';
  END IF;
  -- Seul un jeton de suivi valide (non expiré) peut recevoir des notifications
  IF NOT EXISTS (
    SELECT 1 FROM client_tracking_tokens
    WHERE token = p_tracking_token AND expires_at > now()
  ) THEN
    RAISE EXCEPTION 'Lien de suivi invalide ou expiré';
  END IF;

  INSERT INTO client_push_devices (tracking_token, fcm_token, platform)
  VALUES (p_tracking_token, p_fcm_token, p_platform)
  ON CONFLICT (tracking_token, fcm_token)
  DO UPDATE SET last_seen_at = now(), platform = EXCLUDED.platform;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_push_device(TEXT, TEXT, TEXT)
  TO anon, authenticated, service_role;

-- ── 3. Distribution de l'APK Android ───────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'app-releases', 'app-releases', true,
  209715200, -- 200 Mo
  ARRAY['application/vnd.android.package-archive', 'application/json']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
-- Lecture publique (bucket public) ; écriture réservée à la clé service (CI) : pas de policy d'insertion.
