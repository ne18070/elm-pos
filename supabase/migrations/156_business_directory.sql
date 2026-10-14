-- Annuaire public des boutiques et services ELM (app Flutter « ELM Boutique », buyer_app/)
--
-- 1. businesses.directory_listed : une entreprise figure dans l'annuaire par défaut ;
--    le propriétaire peut s'en retirer depuis ses Réglages.
-- 2. list_directory_businesses() : RPC publique (anon) qui ne renvoie que des colonnes
--    sûres. Une entreprise apparaît si elle a au moins un produit actif (vitrine boutique,
--    /boutique/[id]) ou une prestation active (catalogue de services, /services/[id]).
--    L'app ne lit donc pas la table businesses directement pour l'annuaire.

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS directory_listed BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.businesses.directory_listed IS
  'Visible dans l''annuaire de l''app ELM Boutique (list_directory_businesses). Défaut true, désactivable par le propriétaire.';

-- Index partiel pour le filtre « prestations actives » (celui des produits existe : idx_products_business)
CREATE INDEX IF NOT EXISTS idx_service_catalog_business_active
  ON public.service_catalog(business_id) WHERE is_active;

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

COMMENT ON FUNCTION public.list_directory_businesses(TEXT, TEXT, INTEGER, INTEGER) IS
  'Annuaire public de l''app ELM Boutique : entreprises directory_listed ayant des produits ou prestations actifs. Colonnes non sensibles uniquement.';

-- Publique : appelée sans session par l'app acheteur
GRANT EXECUTE ON FUNCTION public.list_directory_businesses(TEXT, TEXT, INTEGER, INTEGER)
  TO anon, authenticated, service_role;
