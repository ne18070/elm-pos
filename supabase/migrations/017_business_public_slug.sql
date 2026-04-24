CREATE EXTENSION IF NOT EXISTS unaccent;

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS public_slug TEXT;

CREATE OR REPLACE FUNCTION slugify_public_text(value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(both '-' from regexp_replace(lower(unaccent(coalesce(value, ''))), '[^a-z0-9]+', '-', 'g'));
$$;

CREATE OR REPLACE FUNCTION generate_unique_business_public_slug(base_value TEXT, current_business_id UUID DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  suffix INTEGER := 1;
BEGIN
  base_slug := slugify_public_text(base_value);

  IF base_slug IS NULL OR base_slug = '' THEN
    base_slug := 'business';
  END IF;

  candidate := base_slug;

  WHILE EXISTS (
    SELECT 1
    FROM businesses
    WHERE public_slug = candidate
      AND (current_business_id IS NULL OR id <> current_business_id)
  ) LOOP
    suffix := suffix + 1;
    candidate := base_slug || '-' || suffix::TEXT;
  END LOOP;

  RETURN candidate;
END;
$$;

CREATE OR REPLACE FUNCTION set_business_public_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.public_slug := generate_unique_business_public_slug(
      coalesce(nullif(trim(NEW.public_slug), ''), NEW.name),
      NEW.id
    );
    RETURN NEW;
  END IF;

  IF NEW.public_slug IS NULL OR trim(NEW.public_slug) = '' THEN
    IF OLD.public_slug IS NULL OR trim(OLD.public_slug) = '' OR NEW.name IS DISTINCT FROM OLD.name THEN
      NEW.public_slug := generate_unique_business_public_slug(NEW.name, NEW.id);
    ELSE
      NEW.public_slug := OLD.public_slug;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.public_slug IS DISTINCT FROM OLD.public_slug THEN
    NEW.public_slug := generate_unique_business_public_slug(NEW.public_slug, NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_business_public_slug ON businesses;
CREATE TRIGGER trg_set_business_public_slug
BEFORE INSERT OR UPDATE OF name, public_slug
ON businesses
FOR EACH ROW
EXECUTE FUNCTION set_business_public_slug();

UPDATE businesses b
SET public_slug = generate_unique_business_public_slug(b.name, b.id)
WHERE b.public_slug IS NULL OR trim(b.public_slug) = '';

ALTER TABLE businesses
ALTER COLUMN public_slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS businesses_public_slug_key
ON businesses(public_slug);

DROP FUNCTION IF EXISTS get_my_businesses();

CREATE OR REPLACE FUNCTION get_my_businesses()
RETURNS TABLE (
  id               UUID,
  name             TEXT,
  public_slug      TEXT,
  type             TEXT,
  denomination     TEXT,
  rib              TEXT,
  brand_config     JSONB,
  types            JSONB,
  features         JSONB,
  address          TEXT,
  phone            TEXT,
  email            TEXT,
  logo_url         TEXT,
  currency         TEXT,
  tax_rate         NUMERIC,
  tax_inclusive    BOOLEAN,
  receipt_footer   TEXT,
  stock_units      JSONB,
  webhook_whitelist JSONB,
  owner_id         UUID,
  created_at       TIMESTAMPTZ,
  member_role      TEXT,
  organization_id  UUID,
  organization_name TEXT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.id, b.name, b.public_slug, b.type, b.denomination, b.rib,
    b.brand_config,
    to_jsonb(COALESCE(b.types,            '{}'::text[])),
    to_jsonb(COALESCE(b.features,         '{}'::text[])),
    b.address, b.phone, b.email, b.logo_url,
    b.currency, b.tax_rate,
    COALESCE(b.tax_inclusive, false),
    b.receipt_footer,
    COALESCE(b.stock_units,               '[]'::jsonb),
    to_jsonb(COALESCE(b.webhook_whitelist,'{}'::text[])),
    b.owner_id, b.created_at,
    bm.role AS member_role,
    o.id   AS organization_id,
    o.legal_name AS organization_name
  FROM business_members bm
  JOIN businesses b ON b.id = bm.business_id
  LEFT JOIN organizations o ON o.id = b.organization_id
  WHERE bm.user_id = auth.uid();
END;
$$;
