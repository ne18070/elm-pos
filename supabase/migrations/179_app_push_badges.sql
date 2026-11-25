-- 179 — Pastille de l'icône de l'app « ELM Boutique » (nombre de notifications non lues)
--
-- iOS n'affiche un nombre sur l'icône que si la notification le porte (aps.badge),
-- calculé côté serveur. On compte les ORDRES notifiés non lus par téléphone (jeton
-- FCM), pas les envois : les notifications d'un même OT se remplacent
-- (apns-collapse-id / tag), la pastille aussi. L'app remet le compteur à zéro à
-- chaque ouverture (app_push_badge_clear).
--
-- Clé = jeton FCM : couvre les deux chemins d'envoi (appareil lié au comptoir,
-- migration 178, et abonnement à un suivi, migration 159).

CREATE TABLE IF NOT EXISTS public.app_push_unread (
  fcm_token  text        NOT NULL,
  tag        text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fcm_token, tag)
);

ALTER TABLE public.app_push_unread ENABLE ROW LEVEL SECURITY;
-- Aucune policy : accès uniquement par les fonctions ci-dessous
REVOKE ALL ON TABLE public.app_push_unread FROM anon, authenticated;
GRANT ALL ON TABLE public.app_push_unread TO service_role;

-- Serveur (/api/client-push/notify) : marque l'OT non lu pour ce téléphone et
-- renvoie la valeur de la pastille. Les entrées de plus de 30 jours ne comptent
-- plus (app jamais rouverte, jeton abandonné).
CREATE OR REPLACE FUNCTION public.app_push_badge_increment(p_fcm_token text, p_tag text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM app_push_unread
   WHERE fcm_token = p_fcm_token AND created_at < now() - interval '30 days';

  INSERT INTO app_push_unread (fcm_token, tag)
  VALUES (p_fcm_token, p_tag)
  ON CONFLICT (fcm_token, tag) DO UPDATE SET created_at = now();

  SELECT count(*) INTO v_count FROM app_push_unread WHERE fcm_token = p_fcm_token;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.app_push_badge_increment(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_push_badge_increment(text, text) TO service_role;

-- App (client anonyme) : remise à zéro à l'ouverture. Le jeton FCM n'est connu
-- que du téléphone et du serveur ; au pire, un tiers qui le connaîtrait ne
-- pourrait qu'effacer une pastille.
CREATE OR REPLACE FUNCTION public.app_push_badge_clear(p_fcm_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM app_push_unread WHERE fcm_token = p_fcm_token;
$$;

REVOKE ALL ON FUNCTION public.app_push_badge_clear(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_push_badge_clear(text) TO anon, authenticated, service_role;
