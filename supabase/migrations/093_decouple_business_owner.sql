-- Migration 093 : Découplage Structure (Business) et Propriétaire (Owner)
-- Permet de créer un établissement sans propriétaire initial et ajoute les champs légaux/branding.

-- 1. Rendre owner_id optionnel
ALTER TABLE public.businesses ALTER COLUMN owner_id DROP NOT NULL;

-- 2. Ajouter les nouveaux champs pour la Structure
ALTER TABLE public.businesses
ADD COLUMN IF NOT EXISTS denomination TEXT,
ADD COLUMN IF NOT EXISTS rib TEXT,
ADD COLUMN IF NOT EXISTS brand_config JSONB DEFAULT '{}'::jsonb;

-- 3. Mettre à jour get_my_businesses pour inclure les nouveaux champs
DROP FUNCTION IF EXISTS get_my_businesses();
CREATE OR REPLACE FUNCTION get_my_businesses()
RETURNS TABLE (
  id              UUID,
  name            TEXT,
  type            TEXT,
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
  member_role     TEXT,
  denomination    TEXT,
  rib             TEXT,
  brand_config    JSONB,
  types           TEXT[],
  features        TEXT[]
)
SECURITY DEFINER LANGUAGE sql AS $$
  SELECT
    b.id, b.name, b.type, b.address, b.phone, b.email, b.logo_url,
    b.currency, b.tax_rate, b.receipt_footer, b.stock_units,
    b.owner_id, b.created_at,
    bm.role AS member_role,
    b.denomination, b.rib, b.brand_config,
    b.types, b.features
  FROM businesses b
  JOIN business_members bm ON bm.business_id = b.id
  WHERE bm.user_id = auth.uid();
$$;

-- 4. Ajouter une politique RLS pour permettre aux superadmins de tout voir dans businesses
DROP POLICY IF EXISTS "superadmin_all_businesses" ON businesses;
CREATE POLICY "superadmin_all_businesses" ON businesses
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true)
  );

-- 5. Mettre à jour create_business pour accepter la dénomination et initialiser les modules par défaut
CREATE OR REPLACE FUNCTION create_business(business_data JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_biz businesses;
  v_type TEXT;
  v_features TEXT[];
BEGIN
  v_type := business_data->>'type';
  
  -- Initialisation des modules par défaut selon le type
  v_features := ARRAY[]::TEXT[];
  IF v_type = 'retail' THEN
    v_features := ARRAY['retail', 'stock', 'expenses'];
  ELSIF v_type = 'restaurant' THEN
    v_features := ARRAY['restaurant', 'retail', 'stock', 'expenses'];
  ELSIF v_type = 'hotel' THEN
    v_features := ARRAY['hotel', 'retail', 'expenses'];
  ELSIF v_type = 'service' THEN
    v_features := ARRAY['legal', 'expenses'];
  END IF;

  INSERT INTO businesses (
    name, 
    denomination,
    type, 
    currency, 
    tax_rate, 
    owner_id,
    features,
    types
  ) VALUES (
    business_data->>'name',
    COALESCE(business_data->>'denomination', business_data->>'name'),
    v_type,
    COALESCE(business_data->>'currency', 'XOF'),
    (COALESCE(business_data->>'tax_rate', '0'))::NUMERIC,
    auth.uid(),
    v_features,
    ARRAY[v_type]
  ) RETURNING * INTO v_biz;

  INSERT INTO business_members (business_id, user_id, role)
  VALUES (v_biz.id, auth.uid(), 'owner');

  UPDATE users
  SET business_id = v_biz.id,
      role        = 'owner'
  WHERE id = auth.uid();

  RETURN to_jsonb(v_biz);
END;
$$;
