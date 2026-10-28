-- ============================================================================
-- Migration 164 : Signalements et modération de l'annuaire (App Store 1.2)
--
-- L'app « ELM Boutique » (buyer_app/) affiche des contenus publiés par des
-- tiers (boutiques, produits, prestations). Apple exige : un moyen de signaler
-- un contenu, un moyen de bloquer un auteur (le blocage prévient l'équipe ELM)
-- et une action de l'équipe sous 24 h.
--
-- 1. content_reports : signalements envoyés depuis l'app (sans compte acheteur).
--    Écriture uniquement via la RPC report_content (anon, limitée en fréquence) ;
--    lecture et traitement réservés aux superadmins (backoffice /backoffice/moderation).
--    blocked = true : l'acheteur a aussi bloqué la boutique (masquée sur son téléphone).
-- 2. directory_suspensions : boutiques retirées de l'annuaire par l'équipe ELM.
--    Table séparée de businesses.directory_listed, que le propriétaire peut
--    rebasculer lui-même depuis ses Réglages.
-- 3. list_directory_businesses : exclut les boutiques suspendues.
-- ============================================================================

-- ── 1. Signalements ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.content_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  -- 'business' : la fiche entière ; 'product' / 'service' : target_id = products.id / service_catalog.id
  target_type  TEXT NOT NULL CHECK (target_type IN ('business', 'product', 'service')),
  target_id    UUID,
  target_label TEXT,
  -- NULL : blocage sans motif précisé
  reason       TEXT CHECK (reason IN ('offensive', 'fraud', 'illegal', 'spam', 'other')),
  details      TEXT CHECK (char_length(details) <= 1000),
  blocked      BOOLEAN NOT NULL DEFAULT false,
  -- Identifiant anonyme de l'installation (aucun compte acheteur)
  device_id    TEXT CHECK (char_length(device_id) <= 64),
  platform     TEXT CHECK (platform IN ('ios', 'android', 'web')),
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'actioned')),
  reviewed_at  TIMESTAMPTZ,
  reviewed_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (reason IS NOT NULL OR blocked)
);

CREATE INDEX IF NOT EXISTS idx_content_reports_open
  ON public.content_reports(created_at DESC) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_content_reports_business
  ON public.content_reports(business_id);

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "content_reports_superadmin_select" ON public.content_reports;
CREATE POLICY "content_reports_superadmin_select" ON public.content_reports
  FOR SELECT TO authenticated USING (public.is_superadmin());

DROP POLICY IF EXISTS "content_reports_superadmin_update" ON public.content_reports;
CREATE POLICY "content_reports_superadmin_update" ON public.content_reports
  FOR UPDATE TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.content_reports TO authenticated;
GRANT ALL ON TABLE public.content_reports TO service_role;

-- ── 2. Suspensions de l'annuaire ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.directory_suspensions (
  business_id  UUID PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  reason       TEXT,
  suspended_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.directory_suspensions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "directory_suspensions_superadmin_all" ON public.directory_suspensions;
CREATE POLICY "directory_suspensions_superadmin_all" ON public.directory_suspensions
  FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.directory_suspensions TO authenticated;
GRANT ALL ON TABLE public.directory_suspensions TO service_role;

-- ── 3. RPC publique de signalement ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.report_content(
  p_business_id  UUID,
  p_target_type  TEXT,
  p_reason       TEXT    DEFAULT NULL,
  p_target_id    UUID    DEFAULT NULL,
  p_details      TEXT    DEFAULT NULL,
  p_blocked      BOOLEAN DEFAULT false,
  p_device_id    TEXT    DEFAULT NULL,
  p_platform     TEXT    DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ip    text := public._request_client_ip();
  v_label text;
  v_id    uuid;
BEGIN
  IF v_ip IS NOT NULL
     AND NOT public.check_rate_limit('content_report_ip:' || v_ip, 20, 600) THEN
    RAISE EXCEPTION 'Trop de signalements en peu de temps. Réessayez dans quelques minutes.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM businesses WHERE id = p_business_id) THEN
    RAISE EXCEPTION 'Boutique introuvable.' USING ERRCODE = 'no_data_found';
  END IF;

  -- Le contenu signalé doit appartenir à la boutique ; son nom est figé
  -- pour que le modérateur sache de quoi il s'agit même s'il est renommé.
  IF p_target_type = 'product' THEN
    SELECT name INTO v_label FROM products WHERE id = p_target_id AND business_id = p_business_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produit introuvable.' USING ERRCODE = 'no_data_found'; END IF;
  ELSIF p_target_type = 'service' THEN
    SELECT name INTO v_label FROM service_catalog WHERE id = p_target_id AND business_id = p_business_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Prestation introuvable.' USING ERRCODE = 'no_data_found'; END IF;
  ELSE
    p_target_id := NULL;
  END IF;

  INSERT INTO content_reports (
    business_id, target_type, target_id, target_label, reason, details,
    blocked, device_id, platform
  ) VALUES (
    p_business_id, p_target_type, p_target_id, v_label, p_reason,
    NULLIF(left(trim(COALESCE(p_details, '')), 1000), ''),
    COALESCE(p_blocked, false), left(p_device_id, 64), p_platform
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.report_content(UUID, TEXT, TEXT, UUID, TEXT, BOOLEAN, TEXT, TEXT) IS
  'Signalement (et blocage) d''une boutique, d''un produit ou d''une prestation depuis l''app ELM Boutique. Traité dans /backoffice/moderation.';

-- Publique : appelée sans session par l'app acheteur
GRANT EXECUTE ON FUNCTION public.report_content(UUID, TEXT, TEXT, UUID, TEXT, BOOLEAN, TEXT, TEXT)
  TO anon, authenticated, service_role;

-- ── 4. Annuaire : boutiques suspendues exclues ──────────────────────────────
CREATE OR REPLACE FUNCTION public.list_directory_businesses(
  p_search TEXT    DEFAULT NULL,
  p_kind   TEXT    DEFAULT NULL,   -- NULL = tout, 'boutique' ou 'service'
  p_limit  INTEGER DEFAULT 30,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id           UUID,
  name         TEXT,
  logo_url     TEXT,
  address      TEXT,
  public_slug  TEXT,
  has_products BOOLEAN,
  has_services BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH listed AS (
    SELECT
      b.id, b.name, b.logo_url, b.address, b.public_slug,
      EXISTS (SELECT 1 FROM products p
              WHERE p.business_id = b.id AND p.is_active)        AS has_products,
      EXISTS (SELECT 1 FROM service_catalog s
              WHERE s.business_id = b.id AND s.is_active)        AS has_services
    FROM businesses b
    WHERE b.directory_listed
      AND NOT EXISTS (SELECT 1 FROM directory_suspensions ds WHERE ds.business_id = b.id)
      AND (
        nullif(trim(p_search), '') IS NULL
        OR unaccent(lower(b.name || ' ' || coalesce(b.address, '')))
           LIKE '%' || unaccent(lower(
                 -- % et _ saisis par l'utilisateur sont pris littéralement
                 replace(replace(replace(trim(p_search), '\', '\\'), '%', '\%'), '_', '\_')
               )) || '%'
      )
  )
  SELECT l.id, l.name, l.logo_url, l.address, l.public_slug, l.has_products, l.has_services
  FROM listed l
  WHERE (l.has_products OR l.has_services)
    AND (p_kind IS NULL
         OR (p_kind = 'boutique' AND l.has_products)
         OR (p_kind = 'service'  AND l.has_services))
  ORDER BY lower(l.name), l.id
  LIMIT  least(greatest(coalesce(p_limit, 30), 1), 100)
  OFFSET greatest(coalesce(p_offset, 0), 0);
$$;

GRANT EXECUTE ON FUNCTION public.list_directory_businesses(TEXT, TEXT, INTEGER, INTEGER)
  TO anon, authenticated, service_role;
