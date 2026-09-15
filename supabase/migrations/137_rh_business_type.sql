-- ============================================================================
-- Migration 137 : Type d'établissement dédié 'rh' (au lieu de réutiliser 'service')
--
-- Bug : create_business_v2 (134_rh_only_onboarding.sql) assigne v_type :=
-- 'service' aux organisations "RH / SIRH uniquement" (secteur 'rh') pour
-- éviter une migration de contrainte. Mais 'service' n'est pas un simple
-- label neutre :
--   1. NAV_BY_TYPE['service'] (renderer/lib/nav-config.ts) inclut la section
--      "Ventes & Services" (Caisse, Commandes, Prestations, Contrats...) —
--      une organisation RH pure n'a besoin d'aucune de ces sections.
--   2. hasFeature() (renderer/lib/permissions.ts) a un fallback générique
--      `bTypes.includes(feature)` : comme `types` est peuplé avec
--      ARRAY[v_type] = ARRAY['service'], et que view_services a
--      `feature: 'service'`, TOUTE organisation RH se voit donc accorder
--      l'accès à /services ("Prestations") — visible dans le menu alors
--      que business.features ne contient que ['staff'].
--
-- Cette migration ajoute 'rh' comme valeur de type à part entière (même
-- mécanisme que l'ajout de 'juridique' en 038_onboarding_complete.sql), et
-- met à jour create_business_v2 pour l'utiliser à la place de 'service'.
-- Le rendu du menu (NAV_BY_TYPE.rh) est ajouté côté renderer.
-- ============================================================================

-- ── 1. Étendre le CHECK constraint pour accepter 'rh' ──────────────────────

DO $$
BEGIN
  ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_type_check;
  ALTER TABLE public.businesses ADD CONSTRAINT businesses_type_check
    CHECK (type IN ('restaurant', 'retail', 'service', 'hotel', 'juridique', 'rh'));
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Impossible de modifier businesses_type_check : %', SQLERRM;
END $$;

-- ── 2. create_business_v2 : secteur 'rh' → type 'rh' (au lieu de 'service') ─

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
    WHEN 'rh' THEN
      v_type     := 'rh';
      v_features := ARRAY['staff'];
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

-- ── 3. Backfill : orgs RH déjà créées avec l'ancien type='service' ─────────
-- Ciblage strict (industry_sector='rh' ET features=['staff'] uniquement) pour
-- ne toucher aucune organisation "Atelier/Services" légitime au type 'service'.

UPDATE public.businesses
SET type = 'rh', types = ARRAY['rh']
WHERE industry_sector = 'rh'
  AND type = 'service'
  AND features = ARRAY['staff'];
