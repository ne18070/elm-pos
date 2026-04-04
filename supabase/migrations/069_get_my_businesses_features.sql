-- Migration 069: Ajouter features + types au RPC get_my_businesses
-- Chaque établissement a ses propres features/types indépendamment

DROP FUNCTION IF EXISTS get_my_businesses();

CREATE OR REPLACE FUNCTION get_my_businesses()
RETURNS TABLE (
  id              UUID,
  name            TEXT,
  type            TEXT,
  types           TEXT[],
  features        TEXT[],
  address         TEXT,
  phone           TEXT,
  email           TEXT,
  logo_url        TEXT,
  currency        TEXT,
  tax_rate        NUMERIC,
  receipt_footer  TEXT,
  stock_units     JSONB,
  owner_id        UUID,
  created_at      TIMESTAMPTZ,
  member_role     TEXT
)
SECURITY DEFINER LANGUAGE sql AS $$
  SELECT
    b.id, b.name, b.type,
    COALESCE(b.types, '{}'::text[])    AS types,
    COALESCE(b.features, '{}'::text[]) AS features,
    b.address, b.phone, b.email, b.logo_url,
    b.currency, b.tax_rate, b.receipt_footer, b.stock_units,
    b.owner_id, b.created_at,
    bm.role AS member_role
  FROM businesses b
  JOIN business_members bm ON bm.business_id = b.id
  WHERE bm.user_id = auth.uid()
  ORDER BY b.name;
$$;
