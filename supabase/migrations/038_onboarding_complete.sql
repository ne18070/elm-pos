-- Migration: 038_onboarding_complete.sql
-- Safe, transactionnelle. Aucune colonne existante modifiée.
-- Rollback documenté en bas du fichier.

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- 1. Étendre le CHECK constraint pour accepter 'juridique'
--    Backward-compatible : on ajoute sans retirer aucune valeur.
-- ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_type_check;
  ALTER TABLE public.businesses ADD CONSTRAINT businesses_type_check
    CHECK (type IN ('restaurant', 'retail', 'service', 'hotel', 'juridique'));
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Impossible de modifier businesses_type_check : %', SQLERRM;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 2. Colonne industry_sector (ajoutée en 037, idempotente ici)
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS industry_sector TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS onboarding_done  BOOLEAN DEFAULT FALSE;

-- ─────────────────────────────────────────────────────────────────
-- 3. Colonne business_id sur analytics_events
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS business_id UUID;
CREATE INDEX IF NOT EXISTS idx_analytics_events_biz ON public.analytics_events (business_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────
-- 4. RPC : create_business_v2
--    - Features cohérentes avec NAV_ITEMS du Sidebar
--    - INSERT dans business_members (requis pour get_my_businesses)
--    - types[] synchronisé avec type
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_business_v2(p_name TEXT, p_sector TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_biz_id  UUID;
  v_org_id  UUID;
  v_type    TEXT;
  v_features TEXT[];
BEGIN
  -- Mapping secteur → type Supabase + features sidebar
  CASE p_sector
    WHEN 'restaurant' THEN
      v_type     := 'restaurant';
      v_features := ARRAY['restaurant', 'retail', 'stock', 'expenses'];
    WHEN 'hotel' THEN
      v_type     := 'hotel';
      v_features := ARRAY['hotel', 'retail', 'expenses'];
    WHEN 'location' THEN
      v_type     := 'service';
      v_features := ARRAY['contrats', 'voitures', 'expenses'];
    WHEN 'juridique' THEN
      v_type     := 'juridique';
      v_features := ARRAY['dossiers', 'honoraires', 'expenses'];
    ELSE -- boutique / retail / autre
      v_type     := 'retail';
      v_features := ARRAY['retail', 'stock', 'expenses'];
  END CASE;

  -- 1. Organisation : créer si inexistante, sinon réutiliser
  --    (un owner = une org, contrainte UNIQUE owner_id)
  INSERT INTO public.organizations (legal_name, owner_id, currency)
  VALUES (p_name, auth.uid(), 'XOF')
  ON CONFLICT (owner_id) DO UPDATE SET legal_name = EXCLUDED.legal_name
  RETURNING id INTO v_org_id;

  -- 2. Business lié à l'org
  INSERT INTO public.businesses (
    name, type, industry_sector, features, types, currency,
    owner_id, organization_id
  )
  VALUES (p_name, v_type, p_sector, v_features, ARRAY[v_type], 'XOF', auth.uid(), v_org_id)
  RETURNING id INTO v_biz_id;

  -- 3. Profil utilisateur → pointer sur ce business
  UPDATE public.users
  SET business_id = v_biz_id, role = 'owner'
  WHERE id = auth.uid();

  -- 4. Membership requis pour get_my_businesses() et les RLS business_members
  INSERT INTO public.business_members (business_id, user_id, role)
  VALUES (v_biz_id, auth.uid(), 'owner')
  ON CONFLICT (business_id, user_id) DO NOTHING;

  RETURN v_biz_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 5. RPC : activate_trial_v2
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.activate_trial_v2(p_biz_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.subscriptions (business_id, status, trial_ends_at)
  VALUES (p_biz_id, 'trial', NOW() + INTERVAL '7 days')
  ON CONFLICT (business_id) DO UPDATE
    SET status        = 'trial',
        trial_ends_at = NOW() + INTERVAL '7 days'
    WHERE subscriptions.status IN ('expired', 'none');
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 6. RPC : seed_demo_data (tous secteurs, idempotente)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.seed_demo_data(p_biz_id UUID, p_sector TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cat_id   UUID;
  v_cat2_id  UUID;
  v_floor_id UUID;
  v_already  INT;
BEGIN

  -- Guard : si le business a déjà des données, on sort sans rien faire.
  -- Empêche les doublons sur retry d'onboarding.
  SELECT COUNT(*) INTO v_already
  FROM public.categories
  WHERE business_id = p_biz_id;

  IF v_already > 0 THEN RETURN; END IF;

  -- ── BOUTIQUE / RETAIL / AUTRE ──────────────────────────────────
  IF p_sector IN ('boutique', 'retail', 'autre') THEN

    -- categories : UNIQUE(business_id, name) → ON CONFLICT fiable
    INSERT INTO public.categories (business_id, name, color)
    VALUES (p_biz_id, 'Alimentation', '#3b82f6')
    ON CONFLICT (business_id, name) DO NOTHING
    RETURNING id INTO v_cat_id;

    INSERT INTO public.categories (business_id, name, color)
    VALUES (p_biz_id, 'Boissons', '#f59e0b')
    ON CONFLICT (business_id, name) DO NOTHING;

    INSERT INTO public.categories (business_id, name, color)
    VALUES (p_biz_id, 'Divers', '#6b7280')
    ON CONFLICT (business_id, name) DO NOTHING;

    UPDATE public.businesses SET tax_rate = 18 WHERE id = p_biz_id;

    IF v_cat_id IS NOT NULL THEN
      -- Colonne réelle : "stock" (NUMERIC 10,3), pas "stock_quantity"
      -- track_stock = TRUE pour que le stock soit actif et visible
      INSERT INTO public.products (business_id, category_id, name, price, stock, track_stock)
      VALUES
        (p_biz_id, v_cat_id, 'Riz 5kg',  2500, 50, TRUE),
        (p_biz_id, v_cat_id, 'Huile 1L', 1200, 30, TRUE);
    END IF;

  -- ── RESTAURANT ────────────────────────────────────────────────
  ELSIF p_sector = 'restaurant' THEN

    INSERT INTO public.categories (business_id, name, color)
    VALUES (p_biz_id, 'Boissons', '#ef4444')
    ON CONFLICT (business_id, name) DO NOTHING
    RETURNING id INTO v_cat_id;

    INSERT INTO public.categories (business_id, name, color)
    VALUES (p_biz_id, 'Plats', '#f59e0b')
    ON CONFLICT (business_id, name) DO NOTHING
    RETURNING id INTO v_cat2_id;

    IF v_cat_id IS NOT NULL THEN
      INSERT INTO public.products (business_id, category_id, name, price)
      VALUES
        (p_biz_id, v_cat_id,  'Eau minérale',  300),
        (p_biz_id, v_cat2_id, 'Thiéboudienne', 2500);
    END IF;

    -- restaurant_floors n'a pas de UNIQUE → guard par SELECT
    SELECT id INTO v_floor_id
    FROM public.restaurant_floors
    WHERE business_id = p_biz_id LIMIT 1;

    IF v_floor_id IS NULL THEN
      INSERT INTO public.restaurant_floors (business_id, name)
      VALUES (p_biz_id, 'Salle principale')
      RETURNING id INTO v_floor_id;
    END IF;

    FOR i IN 1..6 LOOP
      INSERT INTO public.restaurant_tables (business_id, floor_id, name, capacity)
      VALUES (p_biz_id, v_floor_id, 'Table ' || i, 4);
    END LOOP;

  -- ── HÔTEL ─────────────────────────────────────────────────────
  ELSIF p_sector = 'hotel' THEN

    -- hotel_rooms n'a pas de UNIQUE sur (business_id, number) → guard par SELECT
    SELECT COUNT(*) INTO v_already FROM public.hotel_rooms WHERE business_id = p_biz_id;
    IF v_already = 0 THEN
      FOR i IN 1..8 LOOP
        INSERT INTO public.hotel_rooms (
          business_id, number, type, capacity, price_per_night, status
        )
        VALUES (
          p_biz_id,
          (100 + i)::TEXT,
          CASE WHEN i <= 4 THEN 'simple' ELSE 'double' END,
          CASE WHEN i <= 4 THEN 1        ELSE 2         END,
          CASE WHEN i <= 4 THEN 25000    ELSE 40000      END,
          'available'
        );
      END LOOP;
    END IF;

  -- ── LOCATION ──────────────────────────────────────────────────
  ELSIF p_sector = 'location' THEN

    -- rental_vehicles n'a pas de UNIQUE → guard par SELECT
    SELECT COUNT(*) INTO v_already FROM public.rental_vehicles WHERE business_id = p_biz_id;
    IF v_already = 0 THEN
      INSERT INTO public.rental_vehicles (business_id, name, brand, model, price_per_day, is_available)
      VALUES
        (p_biz_id, 'Toyota Corolla', 'Toyota',  'Corolla', 30000, TRUE),
        (p_biz_id, 'Renault Logan',  'Renault', 'Logan',   20000, TRUE),
        (p_biz_id, 'Hyundai Tucson', 'Hyundai', 'Tucson',  45000, TRUE);
    END IF;

  -- ── JURIDIQUE ─────────────────────────────────────────────────
  ELSIF p_sector = 'juridique' THEN

    -- dossiers n'a pas de UNIQUE sur reference → guard par SELECT
    SELECT COUNT(*) INTO v_already FROM public.dossiers WHERE business_id = p_biz_id;
    IF v_already = 0 THEN
      INSERT INTO public.dossiers (business_id, reference, client_name, type_affaire)
      VALUES (p_biz_id, 'DOS-DEMO-001', 'Client Démonstration', 'civil');
    END IF;

  END IF;

END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 7. Mettre à jour get_my_businesses pour exposer industry_sector
--    et onboarding_done (nécessaires pour l'onboarding checklist)
-- ─────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_my_businesses();
CREATE OR REPLACE FUNCTION public.get_my_businesses()
RETURNS TABLE (
  id               UUID,
  name             TEXT,
  public_slug      TEXT,
  type             TEXT,
  denomination     TEXT,
  rib              TEXT,
  brand_config     JSONB,
  types            TEXT[],
  features         TEXT[],
  industry_sector  TEXT,
  onboarding_done  BOOLEAN,
  address          TEXT,
  phone            TEXT,
  email            TEXT,
  logo_url         TEXT,
  currency         TEXT,
  tax_rate         NUMERIC,
  tax_inclusive    BOOLEAN,
  receipt_footer   TEXT,
  stock_units      JSONB,
  webhook_whitelist TEXT[],
  owner_id         UUID,
  organization_id  UUID,
  organization_name TEXT,
  created_at       TIMESTAMPTZ,
  member_role      TEXT
)
SECURITY DEFINER
LANGUAGE sql
SET search_path = public
AS $$
  SELECT
    b.id,
    b.name,
    b.public_slug,
    b.type,
    b.denomination,
    b.rib,
    b.brand_config,
    b.types,
    b.features,
    b.industry_sector,
    b.onboarding_done,
    b.address,
    b.phone,
    b.email,
    b.logo_url,
    b.currency,
    b.tax_rate,
    b.tax_inclusive,
    b.receipt_footer,
    b.stock_units,
    b.webhook_whitelist,
    b.owner_id,
    b.organization_id,
    o.legal_name AS organization_name,
    b.created_at,
    bm.role AS member_role
  FROM public.businesses b
  JOIN public.business_members bm ON bm.business_id = b.id
  LEFT JOIN public.organizations o ON o.id = b.organization_id
  WHERE bm.user_id = auth.uid();
$$;

COMMIT;

-- ─────────────────────────────────────────────────────────────────
-- ROLLBACK :
-- Note : l'organization créée lors de l'onboarding restera (safe, pas de données perdues).
-- DROP FUNCTION IF EXISTS public.create_business_v2(TEXT, TEXT);
-- DROP FUNCTION IF EXISTS public.activate_trial_v2(UUID);
-- DROP FUNCTION IF EXISTS public.seed_demo_data(UUID, TEXT);
-- ALTER TABLE public.businesses DROP COLUMN IF EXISTS industry_sector;
-- ALTER TABLE public.businesses DROP COLUMN IF EXISTS onboarding_done;
-- ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_type_check;
-- ALTER TABLE public.businesses ADD CONSTRAINT businesses_type_check
--   CHECK (type IN ('restaurant','retail','service','hotel'));
-- ─────────────────────────────────────────────────────────────────
