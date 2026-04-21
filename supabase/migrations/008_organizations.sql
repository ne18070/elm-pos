-- ============================================================
-- ELM APP — Migration 008 : Table organizations
-- Sépare l'entité légale (Organization) des établissements (Business)
-- ============================================================

-- ─── Table organizations ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organizations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  legal_name    TEXT NOT NULL,         -- Raison sociale
  denomination  TEXT,                  -- Dénomination commerciale (si différente)
  rib           TEXT,
  owner_id      UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  currency      TEXT NOT NULL DEFAULT 'XOF',
  country       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Lier businesses à organizations ─────────────────────────────────────────

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

-- ─── Migration données existantes ────────────────────────────────────────────
-- Une org par propriétaire : on prend le nom du business principal comme legal_name

INSERT INTO organizations (legal_name, denomination, rib, owner_id, currency, created_at)
SELECT DISTINCT ON (b.owner_id)
  COALESCE(b.denomination, b.name) AS legal_name,
  b.denomination,
  b.rib,
  b.owner_id,
  b.currency,
  b.created_at
FROM businesses b
WHERE b.owner_id IS NOT NULL
ORDER BY b.owner_id, b.created_at ASC
ON CONFLICT (owner_id) DO NOTHING;

-- Rattacher chaque business à son org (via owner_id)
UPDATE businesses b
SET organization_id = o.id
FROM organizations o
WHERE o.owner_id = b.owner_id
  AND b.organization_id IS NULL;

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_select" ON organizations;
DROP POLICY IF EXISTS "org_update" ON organizations;
DROP POLICY IF EXISTS "org_insert" ON organizations;

CREATE POLICY "org_select" ON organizations FOR SELECT
  USING (
    owner_id = auth.uid()
    OR id IN (
      SELECT b.organization_id
      FROM businesses b
      JOIN business_members bm ON bm.business_id = b.id
      WHERE bm.user_id = auth.uid()
        AND b.organization_id IS NOT NULL
    )
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND is_superadmin = true
    )
  );

CREATE POLICY "org_update" ON organizations FOR UPDATE
  USING (
    owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_superadmin = true)
  );

CREATE POLICY "org_insert" ON organizations FOR INSERT
  WITH CHECK (
    owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_superadmin = true)
  );

-- ─── Mise à jour RPC get_my_businesses ───────────────────────────────────────
-- Ajoute organization_id et organization_name dans le résultat

DROP FUNCTION IF EXISTS get_my_businesses();

CREATE OR REPLACE FUNCTION get_my_businesses()
RETURNS TABLE (
  id               UUID,
  name             TEXT,
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
    b.id, b.name, b.type, b.denomination, b.rib,
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
