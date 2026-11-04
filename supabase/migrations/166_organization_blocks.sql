-- ============================================================================
-- Migration 166 : Blocage d'une organisation par l'équipe ELM (backoffice)
--
-- Bloquer une organisation (/backoffice/structures) coupe l'accès à tous ses
-- établissements. Cela va plus loin que directory_suspensions (164), qui ne
-- retire la boutique que de l'annuaire.
--
-- 1. organization_blocks : une ligne = organisation bloquée. Table séparée de
--    organizations, car la policy org_update laisse le propriétaire modifier sa
--    propre organisation : une colonne blocked_at lui permettrait de se débloquer.
--    Écriture réservée aux superadmins ; les membres lisent le blocage de leur
--    organisation (écran « organisation suspendue » côté app).
-- 2. is_business_blocked(business_id) : helper utilisé par le trigger, l'annuaire,
--    les pages publiques et l'app.
-- 3. Trigger sur orders : aucune commande (caisse, boutique en ligne, API v1,
--    synchro offline) ne peut être créée pour un établissement bloqué.
-- 4. list_directory_businesses : exclut les établissements des organisations bloquées.
--
-- Les comptes des membres sont bannis côté Supabase Auth par la route
-- /api/admin/block-organization (plus de connexion ni de rafraîchissement de session).
-- ============================================================================

-- ── 1. Blocages ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organization_blocks (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  reason          TEXT CHECK (char_length(reason) <= 500),
  blocked_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.organization_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organization_blocks_superadmin_all" ON public.organization_blocks;
CREATE POLICY "organization_blocks_superadmin_all" ON public.organization_blocks
  FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS "organization_blocks_member_select" ON public.organization_blocks;
CREATE POLICY "organization_blocks_member_select" ON public.organization_blocks
  FOR SELECT TO authenticated USING (
    organization_id IN (
      SELECT b.organization_id
      FROM businesses b
      JOIN business_members bm ON bm.business_id = b.id
      WHERE bm.user_id = auth.uid() AND b.organization_id IS NOT NULL
    )
    OR organization_id IN (SELECT o.id FROM organizations o WHERE o.owner_id = auth.uid())
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organization_blocks TO authenticated;
GRANT ALL ON TABLE public.organization_blocks TO service_role;

-- ── 2. Helper ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_business_blocked(p_business_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM businesses b
    JOIN organization_blocks ob ON ob.organization_id = b.organization_id
    WHERE b.id = p_business_id
  );
$$;

-- anon : les pages publiques (boutique, services…) masquent un établissement bloqué
GRANT EXECUTE ON FUNCTION public.is_business_blocked(UUID) TO anon, authenticated, service_role;

-- ── 3. Aucune commande pour un établissement bloqué ─────────────────────────
CREATE OR REPLACE FUNCTION public.orders_reject_blocked_business()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_business_blocked(NEW.business_id) THEN
    RAISE EXCEPTION 'Cet établissement est suspendu. Contactez le support ELM.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_reject_blocked_business ON public.orders;
CREATE TRIGGER orders_reject_blocked_business
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_reject_blocked_business();

-- ── 4. Annuaire : exclut les organisations bloquées ─────────────────────────
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
      AND NOT EXISTS (SELECT 1 FROM organization_blocks ob WHERE ob.organization_id = b.organization_id)
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
