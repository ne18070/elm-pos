-- ============================================================================
-- Migration 178 : comptes clients de l'app « ELM Boutique » liés au comptoir
--
-- Objectif : notifier les ordres de travail par push au lieu d'un lien
-- WhatsApp/SMS (beaucoup de clients n'ouvrent plus les liens par peur des
-- arnaques). Le lien /track reste le fallback des clients sans l'app.
--
-- Pas d'OTP : le numéro saisi dans l'app est une simple DÉCLARATION. La preuve
-- vient du comptoir — le client montre son « code client » (QR temporaire) et un
-- owner/admin/manager le scanne depuis l'espace partenaire de l'app. Le
-- technicien a le client devant lui : il rapproche le numéro déclaré de celui
-- de l'ordre de travail (qui fait foi) puis lie l'appareil.
--
-- Chaque boutique vérifie elle-même son client : une liaison vaut pour
-- (appareil, boutique, numéro). Tous les ordres de cette boutique pour ce
-- numéro (ouverts au moment de la liaison, puis tous les suivants) arrivent
-- dans l'app et déclenchent des push.
--
--   client_app_devices  identité de l'installation (secret aléatoire de l'app,
--                       stocké haché), profil déclaré, jeton FCM, code
--                       d'appairage temporaire
--   client_app_links    liaisons vérifiées au comptoir
--
-- Aucune policy d'écriture : tout passe par les RPC ci-dessous.
-- ============================================================================

-- ── Normalisation des numéros ────────────────────────────────────────────────
-- client_phone est du texte libre (« 77 123 45 67 », « +221771234567 »,
-- « 00221 77… ») : une seule forme, chiffres uniquement, indicatif inclus.
-- Numéro sénégalais à 9 chiffres (7x / 3x) → préfixé de 221.
CREATE OR REPLACE FUNCTION public.normalize_phone(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN d = '' THEN NULL
    WHEN length(d) = 9 AND d ~ '^[37]' THEN '221' || d
    ELSE d
  END
  FROM (
    SELECT regexp_replace(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '^00', '') AS d
  ) s;
$$;

GRANT EXECUTE ON FUNCTION public.normalize_phone(text) TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_service_orders_business_phone
  ON public.service_orders (business_id, public.normalize_phone(client_phone));

-- ── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_app_devices (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- sha256 du secret généré par l'app (jamais stocké en clair)
  secret_hash        text        NOT NULL UNIQUE,
  display_name       text        NOT NULL,
  declared_phone     text        NOT NULL,
  fcm_token          text,
  platform           text        CHECK (platform IN ('android', 'ios')),
  pairing_code       text        UNIQUE,
  pairing_expires_at timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  last_seen_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_app_links (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id        uuid        NOT NULL REFERENCES public.client_app_devices(id) ON DELETE CASCADE,
  business_id      uuid        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  phone_normalized text        NOT NULL,
  linked_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- Dernier scan au comptoir (une re-liaison ne change pas created_at, qui borne
  -- les ordres synchronisés) : /api/client-app/linked n'envoie « App liée »
  -- qu'à ce moment-là
  last_linked_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_id, business_id, phone_normalized)
);

-- Migration déjà appliquée avant l'ajout de ces colonnes
ALTER TABLE public.client_app_links
  ADD COLUMN IF NOT EXISTS last_linked_at timestamptz NOT NULL DEFAULT now();
-- Dernier envoi de « App liée » : une seule notification par scan
ALTER TABLE public.client_app_links
  ADD COLUMN IF NOT EXISTS link_notified_at timestamptz;

-- Les ordres d'une boutique liée sont notifiés par client_app_push_targets
-- (appareil lié + numéro de l'OT, revérifiés à chaque envoi), JAMAIS par un
-- abonnement client_push_devices : un tel abonnement survivrait à une correction
-- du numéro de l'OT. Une version précédente de cette migration créait ces
-- abonnements (colonne source = 'client_app') : on les retire avec la colonne.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'client_push_devices'
                AND column_name = 'source') THEN
    DELETE FROM public.client_push_devices WHERE source = 'client_app';
    ALTER TABLE public.client_push_devices DROP COLUMN source;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_client_app_links_business_phone
  ON public.client_app_links (business_id, phone_normalized);

-- Jetons de suivi créés automatiquement pour une app liée (synchro, notification)
-- et non envoyés au client : le dashboard ne doit pas afficher « Lien partagé »
ALTER TABLE public.client_tracking_tokens
  ADD COLUMN IF NOT EXISTS auto_created boolean NOT NULL DEFAULT false;

-- Date d'annulation d'un OT : comme paid_at / finished_at, elle borne la
-- couverture d'une liaison (_client_app_link_covers). Sans elle, un ordre ouvert
-- à la liaison puis annulé sortait de l'app sans que le client le sache.
-- Posée par trigger : l'annulation passe par plusieurs chemins (dashboard, RPC).
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

CREATE OR REPLACE FUNCTION public._service_orders_set_cancelled_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'annule' AND OLD.status IS DISTINCT FROM 'annule' THEN
    NEW.cancelled_at := now();
  ELSIF NEW.status IS DISTINCT FROM 'annule' THEN
    NEW.cancelled_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._service_orders_set_cancelled_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_service_orders_cancelled_at ON public.service_orders;
CREATE TRIGGER trg_service_orders_cancelled_at
  BEFORE UPDATE OF status ON public.service_orders
  FOR EACH ROW
  EXECUTE FUNCTION public._service_orders_set_cancelled_at();

-- Ordres que le client a retirés de « Mes suivis » : plus synchronisés ni notifiés
CREATE TABLE IF NOT EXISTS public.client_app_muted_orders (
  device_id        uuid        NOT NULL REFERENCES public.client_app_devices(id) ON DELETE CASCADE,
  service_order_id uuid        NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, service_order_id)
);
ALTER TABLE public.client_app_muted_orders ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.client_app_muted_orders TO authenticated;
GRANT ALL ON TABLE public.client_app_muted_orders TO service_role;

ALTER TABLE public.client_app_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_app_links   ENABLE ROW LEVEL SECURITY;

-- Les membres voient les liaisons de leur établissement (badge « App liée »)
DROP POLICY IF EXISTS "client_app_links_select_members" ON public.client_app_links;
CREATE POLICY "client_app_links_select_members" ON public.client_app_links
  FOR SELECT TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = auth.uid()
      UNION
      SELECT business_id FROM public.business_members WHERE user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.client_app_devices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.client_app_links   TO authenticated;
GRANT ALL ON TABLE public.client_app_devices TO service_role;
GRANT ALL ON TABLE public.client_app_links   TO service_role;

-- ── Helpers internes ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._client_app_secret_hash(p_secret text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF length(coalesce(p_secret, '')) < 32 THEN
    RAISE EXCEPTION 'Identifiant d''appareil invalide';
  END IF;
  RETURN encode(extensions.digest(p_secret, 'sha256'), 'hex');
END;
$$;

CREATE OR REPLACE FUNCTION public._client_app_device_id(p_secret text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id   uuid;
  v_seen timestamptz;
BEGIN
  SELECT id, last_seen_at INTO v_id, v_seen
    FROM client_app_devices
   WHERE secret_hash = public._client_app_secret_hash(p_secret);
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Compte client introuvable : recréez-le depuis l''app'
      USING ERRCODE = 'no_data_found';
  END IF;
  -- Activité à l'heure près : l'écran du code sonde toutes les 5 s, pas
  -- question d'écrire la ligne à chaque fois
  IF v_seen < now() - INTERVAL '1 hour' THEN
    UPDATE client_app_devices SET last_seen_at = now() WHERE id = v_id;
  END IF;
  RETURN v_id;
END;
$$;

-- Owner / admin / manager de l'établissement (mêmes rôles que l'espace
-- partenaire). Seule définition de ces rôles : utilisée par les RPC (via
-- _assert_client_app_manager) et par /api/client-app/linked (clé service).
CREATE OR REPLACE FUNCTION public._is_client_app_manager(p_business_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM business_members bm
             WHERE bm.business_id = p_business_id
               AND bm.user_id = p_user_id
               AND bm.role IN ('owner', 'admin', 'manager'))
    OR EXISTS (SELECT 1 FROM businesses b
                WHERE b.id = p_business_id AND b.owner_id = p_user_id)
  );
$$;

CREATE OR REPLACE FUNCTION public._assert_client_app_manager(p_business_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public._is_client_app_manager(p_business_id, auth.uid()) THEN
    RAISE EXCEPTION 'ACCES_REFUSE: réservé au propriétaire, à l''administrateur ou au manager'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$$;

-- Membre de l'établissement, quel que soit son rôle (ou propriétaire). Seule
-- définition : utilisée par les RPC du dashboard et par /api/client-push/notify
-- (clé service), pour que le partage du lien, le badge et l'envoi des push
-- appliquent exactement la même règle.
CREATE OR REPLACE FUNCTION public._is_business_member(p_business_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM business_members bm
             WHERE bm.business_id = p_business_id AND bm.user_id = p_user_id)
    OR EXISTS (SELECT 1 FROM businesses b
                WHERE b.id = p_business_id AND b.owner_id = p_user_id)
  );
$$;

REVOKE ALL ON FUNCTION public._is_business_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._is_business_member(uuid, uuid) TO service_role;

-- Un ordre entre-t-il dans une liaison ? Ouvert, ou créé / terminé / payé / annulé après
-- la liaison. Règle commune à la synchro (overview) et aux push (push_targets).
CREATE OR REPLACE FUNCTION public._client_app_link_covers(
  p_status    text,
  p_created   timestamptz,
  p_closed_at timestamptz,
  p_linked_at timestamptz
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(
    p_status IN ('attente', 'en_cours', 'pause', 'termine')
    OR p_created >= p_linked_at
    OR p_closed_at >= p_linked_at,
    false
  );
$$;

-- ── 5 + 7. Jeton de suivi d'un OT : une seule création, sous verrou ──────────
-- Le plus récent jeton valide, créé au besoin. Verrou par ordre : deux appels
-- simultanés (synchro, notification, partage WhatsApp) ne créent pas deux jetons.
-- p_shared : le jeton part au client (WhatsApp, SMS) → il n'est plus
-- « auto_created » et le dashboard affiche « Lien partagé ».
CREATE OR REPLACE FUNCTION public._ensure_tracking_token(p_service_order_id uuid, p_shared boolean DEFAULT false)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
  v_auto  boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('tracking_token:' || p_service_order_id::text));

  SELECT token, auto_created INTO v_token, v_auto
    FROM client_tracking_tokens
   WHERE service_order_id = p_service_order_id AND expires_at > now()
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_token IS NULL THEN
    INSERT INTO client_tracking_tokens (service_order_id, client_phone, expires_at, auto_created)
    SELECT so.id, so.client_phone,
           now() + CASE WHEN p_shared THEN INTERVAL '30 days' ELSE INTERVAL '90 days' END,
           NOT p_shared
      FROM service_orders so
     WHERE so.id = p_service_order_id
    RETURNING token INTO v_token;
  ELSIF p_shared AND v_auto THEN
    UPDATE client_tracking_tokens SET auto_created = false WHERE token = v_token;
  END IF;

  RETURN v_token;
END;
$$;

-- Partage du suivi d'un OT par un membre de l'établissement (WhatsApp, SMS)
CREATE OR REPLACE FUNCTION public.share_service_order_tracking_token(p_service_order_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM service_orders so
     WHERE so.id = p_service_order_id
       AND public._is_business_member(so.business_id, auth.uid())
  ) THEN
    RAISE EXCEPTION 'ACCES_REFUSE: ordre de travail introuvable'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public._ensure_tracking_token(p_service_order_id, true);
END;
$$;

REVOKE ALL ON FUNCTION public._is_client_app_manager(uuid, uuid)              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._ensure_tracking_token(uuid, boolean)           FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._is_client_app_manager(uuid, uuid)           TO service_role;
GRANT EXECUTE ON FUNCTION public._ensure_tracking_token(uuid, boolean)        TO service_role;
GRANT EXECUTE ON FUNCTION public._client_app_link_covers(text, timestamptz, timestamptz, timestamptz)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.share_service_order_tracking_token(uuid)      TO authenticated, service_role;

-- Code d'appairage saisi ou scanné → {device_id} ou {error, message}.
-- Les échecs sont RENVOYÉS, pas levés : une exception annulerait aussi
-- l'incrément du compteur anti force brute (même transaction), et les essais
-- ratés ne seraient jamais comptés. Les appelants renvoient ce jsonb tel quel.
DROP FUNCTION IF EXISTS public._client_app_device_by_code(text);
CREATE FUNCTION public._client_app_device_by_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code    text := upper(regexp_replace(coalesce(p_code, ''), '^elm-client:', '', 'i'));
  v_id      uuid;
  v_expires timestamptz;
BEGIN
  v_code := regexp_replace(v_code, '[^A-Z0-9]', '', 'g');
  -- Anti force brute des codes (résolution + liaison comptent chacune)
  IF NOT public.check_rate_limit('client_app_code:' || coalesce(auth.uid()::text, 'anon'), 60, 600) THEN
    RETURN jsonb_build_object('error', 'rate_limited',
      'message', 'Trop de tentatives. Réessayez dans quelques minutes.');
  END IF;

  SELECT id, pairing_expires_at INTO v_id, v_expires
    FROM client_app_devices WHERE pairing_code = v_code;
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('error', 'unknown_code',
      'message', 'Code client inconnu. Demandez au client d''ouvrir « Mon code client ».');
  END IF;
  IF v_expires < now() THEN
    RETURN jsonb_build_object('error', 'expired_code',
      'message', 'Code expiré. Le client doit afficher un nouveau code.');
  END IF;
  RETURN jsonb_build_object('device_id', v_id);
END;
$$;

-- Ordres ouverts d'un numéro (p_where_phone) ou d'une recherche (p_query) dans
-- un établissement (format commun aux RPC). Deux requêtes distinctes : un
-- « p_where_phone IS NULL OR … » empêcherait l'usage de l'index
-- (business_id, normalize_phone(client_phone)).
CREATE OR REPLACE FUNCTION public._client_app_order_rows(p_business_id uuid, p_where_phone text, p_query text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- % et _ saisis sont cherchés tels quels, pas comme jokers
  v_pattern text := replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_');
  v_number  text := regexp_replace(coalesce(p_query, ''), '\D', '', 'g');
  v_rows    jsonb;
BEGIN
  IF p_where_phone IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(row_to_json(o)::jsonb ORDER BY o.created_at DESC), '[]'::jsonb)
      INTO v_rows
      FROM (
        SELECT so.id, so.order_number, so.status, so.client_name, so.client_phone,
               public.normalize_phone(so.client_phone) AS phone_normalized,
               so.subject_ref, so.subject_info, so.total, so.created_at
          FROM service_orders so
         WHERE so.business_id = p_business_id
           AND public.normalize_phone(so.client_phone) = p_where_phone
           AND so.status IN ('attente', 'en_cours', 'pause', 'termine')
         ORDER BY so.created_at DESC
         LIMIT 20
      ) o;
  ELSE
    SELECT coalesce(jsonb_agg(row_to_json(o)::jsonb ORDER BY o.created_at DESC), '[]'::jsonb)
      INTO v_rows
      FROM (
        SELECT so.id, so.order_number, so.status, so.client_name, so.client_phone,
               public.normalize_phone(so.client_phone) AS phone_normalized,
               so.subject_ref, so.subject_info, so.total, so.created_at
          FROM service_orders so
         WHERE so.business_id = p_business_id
           AND so.status IN ('attente', 'en_cours', 'pause', 'termine')
           AND (
             p_query IS NULL
             OR so.client_name  ILIKE '%' || v_pattern || '%'
             OR so.client_phone ILIKE '%' || v_pattern || '%'
             OR so.subject_ref  ILIKE '%' || v_pattern || '%'
             OR (v_number <> '' AND so.order_number::text = v_number)
           )
         ORDER BY so.created_at DESC
         LIMIT 20
      ) o;
  END IF;
  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public._client_app_secret_hash(text)                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._client_app_device_id(text)                     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._assert_client_app_manager(uuid)                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._client_app_device_by_code(text)                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._client_app_order_rows(uuid, text, text)        FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._client_app_secret_hash(text)                TO service_role;
GRANT EXECUTE ON FUNCTION public._client_app_device_id(text)                  TO service_role;
GRANT EXECUTE ON FUNCTION public._assert_client_app_manager(uuid)             TO service_role;
GRANT EXECUTE ON FUNCTION public._client_app_device_by_code(text)             TO service_role;
GRANT EXECUTE ON FUNCTION public._client_app_order_rows(uuid, text, text)     TO service_role;

-- ── RPC côté client (app, rôle anon) ────────────────────────────────────────

-- Crée ou met à jour le compte de cette installation. p_fcm_token NULL = inchangé.
CREATE OR REPLACE FUNCTION public.client_app_register(
  p_secret    text,
  p_name      text,
  p_phone     text,
  p_fcm_token text DEFAULT NULL,
  p_platform  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ip        text := public._request_client_ip();
  v_name      text := trim(coalesce(p_name, ''));
  v_id        uuid;
  v_old_phone text;
  v_removed   int := 0;
BEGIN
  -- Seules les créations de compte comptent : les mises à jour (jeton FCM au
  -- lancement…) passeraient sinon la limite derrière l'IP partagée d'un opérateur
  IF v_ip IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM client_app_devices
                      WHERE secret_hash = public._client_app_secret_hash(p_secret))
     AND NOT public.check_rate_limit('client_app_register_ip:' || v_ip, 30, 600) THEN
    RAISE EXCEPTION 'Trop de tentatives. Réessayez dans quelques minutes.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF length(v_name) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Indiquez votre nom (2 caractères minimum).';
  END IF;
  IF length(coalesce(public.normalize_phone(p_phone), '')) < 8 THEN
    RAISE EXCEPTION 'Numéro de téléphone invalide.';
  END IF;
  IF p_platform IS NOT NULL AND p_platform NOT IN ('android', 'ios') THEN
    RAISE EXCEPTION 'Plateforme invalide';
  END IF;

  SELECT declared_phone INTO v_old_phone
    FROM client_app_devices WHERE secret_hash = public._client_app_secret_hash(p_secret);

  INSERT INTO client_app_devices (secret_hash, display_name, declared_phone, fcm_token, platform)
  VALUES (public._client_app_secret_hash(p_secret), v_name, trim(p_phone),
          nullif(p_fcm_token, ''), p_platform)
  ON CONFLICT (secret_hash) DO UPDATE
    SET display_name   = EXCLUDED.display_name,
        declared_phone = EXCLUDED.declared_phone,
        fcm_token      = coalesce(EXCLUDED.fcm_token, client_app_devices.fcm_token),
        platform       = coalesce(EXCLUDED.platform, client_app_devices.platform),
        last_seen_at   = now()
  RETURNING id INTO v_id;

  -- Même jeton FCM sur un autre compte : en pratique ce téléphone, réinstallé ou
  -- dont les données ont été effacées (secret perdu). L'ancien compte perd le
  -- jeton, sinon ce téléphone recevrait encore ses push sans moyen de les couper.
  -- On ne SUPPRIME pas ce compte : l'appel est anonyme et rien ne prouve que
  -- l'appelant possède ce jeton — au pire, un compte légitime perd ses push
  -- jusqu'au prochain enregistrement de son jeton, sans perdre ses liaisons.
  IF nullif(p_fcm_token, '') IS NOT NULL THEN
    UPDATE client_app_devices SET fcm_token = NULL
     WHERE fcm_token = p_fcm_token AND id <> v_id;
  END IF;

  -- Nouveau numéro : les liaisons vérifiées au comptoir valaient pour l'ancien.
  -- On les supprime (sinon l'appareil recevrait les ordres du prochain titulaire
  -- de ce numéro) ; chaque boutique devra rescanner le code.
  IF v_old_phone IS NOT NULL
     AND public.normalize_phone(v_old_phone) IS DISTINCT FROM public.normalize_phone(p_phone) THEN
    DELETE FROM client_app_links WHERE device_id = v_id;
    GET DIAGNOSTICS v_removed = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('device_id', v_id, 'links_removed', v_removed);
END;
$$;

-- Nouveau code client (QR), valable 10 minutes, remplace le précédent.
CREATE OR REPLACE FUNCTION public.client_app_pairing_code(p_secret text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_device  uuid := public._client_app_device_id(p_secret);
  -- Sans 0/O, 1/I/L : se dicte et se tape sans ambiguïté
  v_alpha   text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes   bytea;
  v_code    text;
  v_expires timestamptz := now() + INTERVAL '10 minutes';
BEGIN
  LOOP
    v_bytes := extensions.gen_random_bytes(8);
    v_code := '';
    FOR i IN 0..7 LOOP
      v_code := v_code || substr(v_alpha, (get_byte(v_bytes, i) % length(v_alpha)) + 1, 1);
    END LOOP;
    BEGIN
      UPDATE client_app_devices
         SET pairing_code = v_code, pairing_expires_at = v_expires
       WHERE id = v_device;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      -- Collision (rarissime) : nouveau tirage
    END;
  END LOOP;

  -- Durée restante plutôt qu'une date : l'horloge du téléphone peut être décalée
  RETURN jsonb_build_object('code', v_code, 'expires_at', v_expires,
                            'ttl_seconds', 600);
END;
$$;

-- Profil, boutiques liées et ordres de travail de cet appareil. Chaque ordre
-- reçoit un jeton de suivi (créé au besoin) : l'app réutilise l'écran /track.
-- known_tokens : tous les jetons de l'ordre, pour que l'app reconnaisse un ordre
-- qu'elle suit déjà sous un autre jeton (lien WhatsApp, jeton expiré…).
CREATE OR REPLACE FUNCTION public.client_app_overview(p_secret text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_device  uuid := public._client_app_device_id(p_secret);
  v_profile jsonb;
  v_links   jsonb;
  v_ids       uuid[];
  v_truncated boolean;
  v_orders    jsonb;
BEGIN
  SELECT jsonb_build_object('name', display_name, 'phone', declared_phone)
    INTO v_profile FROM client_app_devices WHERE id = v_device;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', l.id, 'business_id', b.id, 'business_name', b.name,
           'logo_url', b.logo_url, 'phone', l.phone_normalized, 'created_at', l.created_at
         ) ORDER BY l.created_at DESC), '[]'::jsonb)
    INTO v_links
    FROM client_app_links l JOIN businesses b ON b.id = l.business_id
   WHERE l.device_id = v_device;

  -- 50 ordres des boutiques liées : les ouverts d'abord (jamais évincés par
  -- l'historique), puis les plus récents. truncated : il y en avait davantage,
  -- l'app ne doit alors pas retirer de « Mes suivis » ceux qui manquent.
  SELECT coalesce(array_agg(o.id ORDER BY o.created_at DESC) FILTER (WHERE o.rn <= 50), '{}'),
         count(*) > 50
    INTO v_ids, v_truncated
    FROM (
      SELECT d.id, d.created_at,
             row_number() OVER (ORDER BY d.is_open DESC, d.created_at DESC) AS rn
        FROM (
        SELECT DISTINCT ON (so.id) so.id, so.created_at,
               so.status IN ('attente', 'en_cours', 'pause', 'termine') AS is_open
          FROM client_app_links l
          JOIN service_orders so
            ON so.business_id = l.business_id
           AND public.normalize_phone(so.client_phone) = l.phone_normalized
         WHERE l.device_id = v_device
           AND NOT EXISTS (SELECT 1 FROM client_app_muted_orders m
                            WHERE m.device_id = v_device AND m.service_order_id = so.id)
           -- Ouverts au moment de la liaison, puis tous les ordres suivants. Un
           -- ordre ouvert à la liaison puis terminé/payé reste listé (son état
           -- final doit arriver dans l'app).
           AND public._client_app_link_covers(so.status, so.created_at,
                                              greatest(so.paid_at, so.finished_at, so.cancelled_at), l.created_at)
         ORDER BY so.id
      ) d
      ORDER BY rn
      LIMIT 51
    ) o;

  -- Jeton de suivi des ordres qui n'en ont pas de valide, en une insertion.
  -- Mêmes verrous que _ensure_tracking_token, pris dans un ordre stable (pas
  -- d'interblocage) : aucun appel simultané ne crée de doublon.
  PERFORM pg_advisory_xact_lock(hashtext('tracking_token:' || ids.id::text))
     FROM unnest(v_ids) AS ids(id)
    ORDER BY ids.id;
  INSERT INTO client_tracking_tokens (service_order_id, client_phone, expires_at, auto_created)
  SELECT so.id, so.client_phone, now() + INTERVAL '90 days', true
    FROM service_orders so
   WHERE so.id = ANY (v_ids)
     AND NOT EXISTS (SELECT 1 FROM client_tracking_tokens t
                      WHERE t.service_order_id = so.id AND t.expires_at > now());

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', so.id, 'order_number', so.order_number, 'status', so.status,
           'subject', coalesce(so.subject_info, so.subject_ref),
           'business_name', b.name, 'created_at', so.created_at,
           'tracking_token', tok.token,
           'known_tokens', coalesce(known.tokens, '[]'::jsonb)
         ) ORDER BY ids.ord), '[]'::jsonb)
    INTO v_orders
    FROM unnest(v_ids) WITH ORDINALITY AS ids(id, ord)
    JOIN service_orders so ON so.id = ids.id
    JOIN businesses b ON b.id = so.business_id
    CROSS JOIN LATERAL (
      SELECT t.token FROM client_tracking_tokens t
       WHERE t.service_order_id = so.id AND t.expires_at > now()
       ORDER BY t.created_at DESC LIMIT 1
    ) tok
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(t.token) AS tokens FROM client_tracking_tokens t
       WHERE t.service_order_id = so.id
    ) known ON true;

  RETURN jsonb_build_object('profile', v_profile, 'links', v_links, 'orders', v_orders,
                            'truncated', v_truncated);
END;
$$;

-- Identifiants des boutiques liées seulement : sondé pendant que le code est
-- affiché pour voir arriver la liaison, sans le coût de client_app_overview.
-- code_used : le code affiché a servi (liaison, re-liaison d'une boutique déjà
-- liée) et n'est plus valable — l'app en affiche un nouveau.
CREATE OR REPLACE FUNCTION public.client_app_link_ids(p_secret text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Résolu une seule fois (dans le WHERE, la fonction VOLATILE serait appelée
  -- par ligne, et jamais si la table est vide)
  v_device uuid := public._client_app_device_id(p_secret);
BEGIN
  RETURN jsonb_build_object(
    'ids', (
      SELECT coalesce(jsonb_agg(l.id ORDER BY l.created_at DESC), '[]'::jsonb)
        FROM client_app_links l
       WHERE l.device_id = v_device
    ),
    'code_used', (SELECT pairing_code IS NULL FROM client_app_devices WHERE id = v_device)
  );
END;
$$;

-- Le client retire une boutique liée : plus d'ordres ni de push de sa part
-- (client_app_push_targets ne trouve plus la liaison). Un ordre suivi par
-- l'utilisateur lui-même (lien /track) reste notifié par son abonnement. Les
-- jetons de suivi de la boutique sont renvoyés ; l'app ne retire de sa liste
-- que ceux ajoutés par la synchro.
DROP FUNCTION IF EXISTS public.client_app_unlink(text, uuid);
CREATE FUNCTION public.client_app_unlink(p_secret text, p_link_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_device uuid := public._client_app_device_id(p_secret);
  v_link   client_app_links;
  v_tokens text[];
BEGIN
  DELETE FROM client_app_links
   WHERE id = p_link_id AND device_id = v_device
  RETURNING * INTO v_link;
  IF v_link.id IS NULL THEN
    RETURN jsonb_build_object('tracking_tokens', '[]'::jsonb);
  END IF;

  SELECT coalesce(array_agg(t.token), '{}') INTO v_tokens
    FROM service_orders so
    JOIN client_tracking_tokens t ON t.service_order_id = so.id
   WHERE so.business_id = v_link.business_id
     AND public.normalize_phone(so.client_phone) = v_link.phone_normalized;

  RETURN jsonb_build_object('tracking_tokens', to_jsonb(v_tokens));
END;
$$;

-- Le client retire un ordre de « Mes suivis » : il n'est plus synchronisé ni
-- notifié sur cet appareil (abonnements push de ce téléphone à l'ordre supprimés).
CREATE OR REPLACE FUNCTION public.client_app_forget_order(p_secret text, p_tracking_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_device uuid := public._client_app_device_id(p_secret);
  v_order  uuid;
  v_fcm    text;
BEGIN
  SELECT service_order_id INTO v_order FROM client_tracking_tokens WHERE token = p_tracking_token;
  IF v_order IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO client_app_muted_orders (device_id, service_order_id)
  VALUES (v_device, v_order)
  ON CONFLICT DO NOTHING;

  SELECT fcm_token INTO v_fcm FROM client_app_devices WHERE id = v_device;
  IF v_fcm IS NOT NULL THEN
    DELETE FROM client_push_devices pd
     USING client_tracking_tokens t
     WHERE t.service_order_id = v_order
       AND pd.tracking_token = t.token
       AND pd.fcm_token = v_fcm;
  END IF;
END;
$$;

-- Suppression du compte client (exigence App Store 5.1.1(v)) : appareil, profil
-- déclaré, jeton FCM, liaisons et ordres retirés (cascade). Les suivis ouverts
-- par l'utilisateur lui-même (lien /track) ne dépendent pas du compte et restent.
CREATE OR REPLACE FUNCTION public.client_app_delete(p_secret text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM client_app_devices WHERE secret_hash = public._client_app_secret_hash(p_secret);
$$;

-- Désabonne ce téléphone d'un suivi (« Retirer de mes suivis »). Connaître le
-- jeton de suivi ET le jeton FCM suffit : c'est ce que l'app a enregistré.
CREATE OR REPLACE FUNCTION public.unregister_push_device(p_tracking_token text, p_fcm_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM client_push_devices
   WHERE tracking_token = p_tracking_token AND fcm_token = p_fcm_token;
$$;

-- Une version précédente de cette migration remplaçait register_push_device
-- (migration 159) par une variante à 4 paramètres (p_source) : on la retire,
-- et la version d'origine à 3 paramètres est recréée (elle avait été supprimée).
DROP FUNCTION IF EXISTS public.register_push_device(text, text, text, text);
CREATE OR REPLACE FUNCTION public.register_push_device(
  p_tracking_token text,
  p_fcm_token      text,
  p_platform       text
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

GRANT EXECUTE ON FUNCTION public.register_push_device(text, text, text)          TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.client_app_register(text, text, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.client_app_pairing_code(text)                    TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.client_app_overview(text)                        TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.client_app_unlink(text, uuid)                    TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.client_app_link_ids(text)                        TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.client_app_forget_order(text, text)              TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.client_app_delete(text)                          TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unregister_push_device(text, text)               TO anon, authenticated, service_role;

-- ── RPC côté boutique (espace partenaire, owner/admin/manager) ──────────────

-- Code scanné → client déclaré + ordres ouverts avec son numéro déclaré.
-- Code refusé : {error, message} (voir _client_app_device_by_code).
CREATE OR REPLACE FUNCTION public.partner_resolve_client_code(p_business_id uuid, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res    jsonb;
  v_device client_app_devices;
  v_phone  text;
BEGIN
  PERFORM public._assert_client_app_manager(p_business_id);
  v_res := public._client_app_device_by_code(p_code);
  IF v_res ? 'error' THEN
    RETURN v_res;
  END IF;
  SELECT * INTO v_device FROM client_app_devices WHERE id = (v_res->>'device_id')::uuid;
  v_phone := public.normalize_phone(v_device.declared_phone);

  RETURN jsonb_build_object(
    'name',  v_device.display_name,
    'phone', v_device.declared_phone,
    'phone_normalized', v_phone,
    'has_push', v_device.fcm_token IS NOT NULL,
    'linked_phones', (
      SELECT coalesce(jsonb_agg(phone_normalized), '[]'::jsonb)
        FROM client_app_links WHERE device_id = v_device.id AND business_id = p_business_id
    ),
    'orders', public._client_app_order_rows(p_business_id, v_phone, NULL)
  );
END;
$$;

-- Recherche d'un ordre ouvert (numéro mal saisi, client avec deux numéros…)
CREATE OR REPLACE FUNCTION public.partner_search_service_orders(p_business_id uuid, p_query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._assert_client_app_manager(p_business_id);
  RETURN public._client_app_order_rows(p_business_id, NULL, nullif(trim(coalesce(p_query, '')), ''));
END;
$$;

-- Lie l'appareil à (boutique, p_phone). p_fix_order_ids : ordres dont le numéro
-- est corrigé en p_phone (faute de frappe au dépôt) avant la liaison.
-- Le code est à usage unique.
--
-- Le numéro déclaré n'est pas vérifié (pas d'OTP) : un ordre ouvert à ce numéro
-- ne prouve pas que la personne au comptoir en est le titulaire (n'importe qui
-- peut déclarer le numéro d'un autre). La liaison exige donc TOUJOURS
-- p_identity_checked : le technicien confirme avoir vérifié l'identité du client.
DROP FUNCTION IF EXISTS public.partner_link_client_app(uuid, text, text, uuid[]);
DROP FUNCTION IF EXISTS public.partner_link_client_app(uuid, text, text, uuid[], boolean);
CREATE FUNCTION public.partner_link_client_app(
  p_business_id      uuid,
  p_code             text,
  p_phone            text,
  p_fix_order_ids    uuid[]  DEFAULT '{}',
  p_identity_checked boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res     jsonb;
  v_device  client_app_devices;
  v_phone   text := public.normalize_phone(p_phone);
  v_link_id uuid;
  v_fixable int := 0;
  v_fixed   int := 0;
  v_count   int;
BEGIN
  PERFORM public._assert_client_app_manager(p_business_id);

  -- Vérifié AVANT le code : une exception levée après sa vérification
  -- annulerait l'incrément du compteur anti force brute
  IF length(coalesce(v_phone, '')) < 8 THEN
    RAISE EXCEPTION 'Numéro de téléphone invalide.';
  END IF;

  v_res := public._client_app_device_by_code(p_code);
  IF v_res ? 'error' THEN
    RETURN v_res;
  END IF;
  SELECT * INTO v_device FROM client_app_devices WHERE id = (v_res->>'device_id')::uuid;

  -- Avant toute écriture (correction d'ordre comprise)
  IF NOT coalesce(p_identity_checked, false) THEN
    RETURN jsonb_build_object('error', 'identity_required',
      'message', 'Confirmez avoir vérifié l''identité du client avant de lier son app.');
  END IF;

  IF coalesce(array_length(p_fix_order_ids, 1), 0) > 0 THEN
    SELECT count(*) INTO v_fixable FROM service_orders
     WHERE business_id = p_business_id
       AND id = ANY (p_fix_order_ids)
       AND status IN ('attente', 'en_cours', 'pause', 'termine');
  END IF;

  IF v_fixable > 0 THEN
    UPDATE service_orders
       SET client_phone = trim(p_phone)
     WHERE business_id = p_business_id
       AND id = ANY (p_fix_order_ids)
       AND status IN ('attente', 'en_cours', 'pause', 'termine');
    GET DIAGNOSTICS v_fixed = ROW_COUNT;
  END IF;

  INSERT INTO client_app_links (device_id, business_id, phone_normalized, linked_by)
  VALUES (v_device.id, p_business_id, v_phone, auth.uid())
  ON CONFLICT (device_id, business_id, phone_normalized)
    DO UPDATE SET linked_by = EXCLUDED.linked_by, last_linked_at = now()
  RETURNING id INTO v_link_id;

  UPDATE client_app_devices SET pairing_code = NULL, pairing_expires_at = NULL WHERE id = v_device.id;

  SELECT count(*) INTO v_count FROM service_orders
   WHERE business_id = p_business_id
     AND public.normalize_phone(client_phone) = v_phone
     AND status IN ('attente', 'en_cours', 'pause', 'termine');

  INSERT INTO activity_logs (business_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (p_business_id, auth.uid(), 'client_app.linked', 'client_app_link', v_link_id,
          jsonb_build_object('client_name', v_device.display_name, 'phone', v_phone,
                             'fixed_orders', v_fixed, 'source', 'elm_boutique_app',
                             'identity_checked', coalesce(p_identity_checked, false)));

  RETURN jsonb_build_object(
    'link_id', v_link_id,
    'has_push', v_device.fcm_token IS NOT NULL,
    'open_orders', v_count,
    'fixed_orders', v_fixed
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.partner_resolve_client_code(uuid, text)               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.partner_search_service_orders(uuid, text)             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.partner_link_client_app(uuid, text, text, uuid[], boolean) TO authenticated, service_role;

-- ── Serveur : appareils à notifier pour un ordre (/api/client-push/notify) ──
CREATE OR REPLACE FUNCTION public.client_app_push_targets(p_service_order_id uuid)
RETURNS TABLE (device_id uuid, fcm_token text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT d.id, d.fcm_token
    FROM service_orders so
    JOIN client_app_links l
      ON l.business_id = so.business_id
     AND l.phone_normalized = public.normalize_phone(so.client_phone)
    JOIN client_app_devices d ON d.id = l.device_id
   WHERE so.id = p_service_order_id
     AND d.fcm_token IS NOT NULL
     AND public._client_app_link_covers(so.status, so.created_at,
                                        greatest(so.paid_at, so.finished_at, so.cancelled_at), l.created_at)
     AND NOT EXISTS (SELECT 1 FROM client_app_muted_orders m
                      WHERE m.device_id = d.id AND m.service_order_id = so.id);
$$;

REVOKE ALL ON FUNCTION public.client_app_push_targets(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_app_push_targets(uuid) TO service_role;

-- ── Dashboard : badge « App liée · notifié par push » ────────────────────────
-- Vrai seulement si cet ordre partira vraiment en push : mêmes règles que
-- client_app_push_targets (jeton FCM, ordre couvert par la liaison, pas retiré
-- de « Mes suivis »). Sinon le dashboard propose le lien WhatsApp.
-- Ancienne version (boutique, numéro) : ignorait couverture et ordres retirés.
DROP FUNCTION IF EXISTS public.has_client_app(uuid, text);
CREATE OR REPLACE FUNCTION public.has_client_app(p_service_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM service_orders so
     WHERE so.id = p_service_order_id
       AND public._is_business_member(so.business_id, auth.uid())
       AND EXISTS (SELECT 1 FROM public.client_app_push_targets(so.id))
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_client_app(uuid) TO authenticated, service_role;

-- ── Serveur : une seule notification « App liée » par scan ─────────────────
-- (/api/client-app/linked) Vrai si la liaison vient d'être scannée (2 min) et
-- n'a pas encore été notifiée depuis ce scan ; marque l'envoi au passage.
CREATE OR REPLACE FUNCTION public.claim_client_app_link_notification(p_link_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH claimed AS (
    UPDATE client_app_links
       SET link_notified_at = now()
     WHERE id = p_link_id
       AND last_linked_at > now() - INTERVAL '2 minutes'
       AND (link_notified_at IS NULL OR link_notified_at < last_linked_at)
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM claimed);
$$;

REVOKE ALL ON FUNCTION public.claim_client_app_link_notification(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_client_app_link_notification(uuid) TO service_role;

-- ── Nouvel ordre pour un numéro lié : push « Ordre enregistré » ────────────
-- En base pour couvrir toutes les créations (dashboard, demande publique,
-- /m/services, API v1…). pg_net appelle /api/client-push/notify (envoi après
-- commit) avec un secret partagé ; sans configuration, le trigger ne fait rien.
--
-- Configuration, une fois, dans le SQL editor (pas dans ce fichier versionné) :
--   SELECT vault.create_secret('https://www.elm-app.click/api/client-push/notify', 'client_push_notify_url');
--   SELECT vault.create_secret('<valeur de CLIENT_PUSH_WEBHOOK_SECRET>', 'client_push_webhook_secret');
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public._notify_client_app_new_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url    text;
  v_secret text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM client_app_links l
     WHERE l.business_id = NEW.business_id
       AND l.phone_normalized = public.normalize_phone(NEW.client_phone)
  ) THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT decrypted_secret INTO v_url
      FROM vault.decrypted_secrets WHERE name = 'client_push_notify_url';
    SELECT decrypted_secret INTO v_secret
      FROM vault.decrypted_secrets WHERE name = 'client_push_webhook_secret';
    IF v_url IS NULL OR v_secret IS NULL THEN
      RETURN NEW;
    END IF;
    PERFORM net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'X-Webhook-Secret', v_secret),
      body    := jsonb_build_object('serviceOrderId', NEW.id, 'event', 'created')
    );
  EXCEPTION WHEN OTHERS THEN
    -- Une notification ne doit jamais empêcher la création d'un ordre
    RAISE WARNING 'Notification « Ordre enregistré » ignorée : %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._notify_client_app_new_order() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_service_orders_client_app_created ON public.service_orders;
CREATE TRIGGER trg_service_orders_client_app_created
  AFTER INSERT ON public.service_orders
  FOR EACH ROW
  WHEN (NEW.client_phone IS NOT NULL)
  EXECUTE FUNCTION public._notify_client_app_new_order();

GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
