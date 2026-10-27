-- ============================================================================
-- Migration 163 : Limites de fréquence sur les points d'entrée publics
--
-- 1. check_rate_limit n'était protégée par aucun REVOKE : PostgreSQL donne
--    EXECUTE à PUBLIC par défaut, donc n'importe qui (anon compris) pouvait
--    gonfler une clé — par ex. 'cash_open:<business_id>' (id public via la
--    boutique) — et bloquer en boucle l'ouverture de caisse d'un commerçant.
--    Elle n'est appelée que par des fonctions SECURITY DEFINER et par les
--    routes serveur (service_role) : on retire l'accès aux clients.
--
-- 2. create_boutique_order (anon) décrémente le stock à chaque commande : des
--    commandes fantômes en rafale vidaient le stock d'une boutique.
--    Le corps (162) est renommé en _create_boutique_order_impl, et
--    create_boutique_order devient une enveloppe qui limite puis délègue.
--    ⚠ Toute évolution future du corps doit modifier _create_boutique_order_impl,
--    pas create_boutique_order (sinon la limite saute).
--
-- Limites (fenêtre de 10 min) :
--   - 30 commandes par adresse IP (large : opérateurs mobiles en CGNAT,
--     beaucoup de clients partagent une IP)
--   - 5 commandes par téléphone et par boutique
-- ============================================================================

-- ── 1. check_rate_limit réservée au serveur ─────────────────────────────────
REVOKE ALL ON FUNCTION public.check_rate_limit(text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, int, int) TO service_role;

-- ── 2. IP du client (en-têtes transmis par PostgREST) ───────────────────────
-- NULL hors requête HTTP (trigger, SQL editor) ou si l'en-tête est absent.
CREATE OR REPLACE FUNCTION public._request_client_ip()
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT NULLIF(trim(split_part(
           COALESCE(
             current_setting('request.headers', true)::json->>'cf-connecting-ip',
             current_setting('request.headers', true)::json->>'x-forwarded-for',
             current_setting('request.headers', true)::json->>'x-real-ip',
             ''
           ), ',', 1)), '');
$$;

REVOKE ALL ON FUNCTION public._request_client_ip() FROM PUBLIC, anon, authenticated;

-- ── 3. create_boutique_order : enveloppe limitée ────────────────────────────
ALTER FUNCTION public.create_boutique_order(jsonb) RENAME TO _create_boutique_order_impl;
REVOKE ALL ON FUNCTION public._create_boutique_order_impl(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._create_boutique_order_impl(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.create_boutique_order(order_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ip    text := public._request_client_ip();
  v_phone text := regexp_replace(COALESCE(order_data->>'customer_phone', ''), '\D', '', 'g');
BEGIN
  IF v_ip IS NOT NULL
     AND NOT public.check_rate_limit('boutique_order_ip:' || v_ip, 30, 600) THEN
    RAISE EXCEPTION 'Trop de commandes en peu de temps. Réessayez dans quelques minutes.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_phone <> ''
     AND NOT public.check_rate_limit(
       'boutique_order_phone:' || COALESCE(order_data->>'business_id', '') || ':' || v_phone, 5, 600) THEN
    RAISE EXCEPTION 'Vous avez déjà passé plusieurs commandes. Réessayez dans quelques minutes ou contactez la boutique.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN public._create_boutique_order_impl(order_data);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_boutique_order(JSONB) TO anon, authenticated, service_role;
