-- ============================================================================
-- Migration 169 : Inscription en libre-service des écoles (type 'education')
--
-- Bug : l'inscription propose « Éducation / École » (secteur 'education'),
-- mais create_business_v2 (137_rh_business_type.sql) n'avait pas de cas pour
-- ce secteur : l'école tombait dans le ELSE et devenait une boutique (type
-- 'retail', modules caisse et stock), sans les modules Élèves / Classes /
-- Scolarité / Notes — que seul un superadmin pouvait ensuite activer.
--
-- Le renderer gère déjà le type 'education' (NAV_BY_TYPE.education,
-- PRIMARY_NAV_BY_TYPE, getContextualRoleLabel, hasFeature) et le catalogue
-- business_types / app_modules le connaît (079_education_module.sql) : il ne
-- manquait que la base. Même mécanisme que l'ajout de 'rh' en 137.
--
-- seed_demo_data n'a pas de branche 'education' : aucune donnée de démo n'est
-- créée pour une école (voulu — pas de faux élèves).
-- ============================================================================

-- ── 1. Étendre le CHECK constraint pour accepter 'education' ───────────────
-- Sans bloc EXCEPTION, volontairement : si la contrainte ne peut pas être
-- modifiée, create_business_v2 ci-dessous ferait échouer chaque inscription
-- d'école — mieux vaut que la migration entière échoue.

ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_type_check;
ALTER TABLE public.businesses ADD CONSTRAINT businesses_type_check
  CHECK (type IN ('restaurant', 'retail', 'service', 'hotel', 'juridique', 'rh', 'education'));

-- ── 2. create_business_v2 : secteur 'education' → type 'education' ─────────
-- Corps identique à 137, plus la branche 'education'.

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
    WHEN 'education' THEN
      v_type     := 'education';
      v_features := ARRAY['eleves', 'classes', 'scolarite', 'notes', 'expenses'];
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

GRANT EXECUTE ON FUNCTION public.create_business_v2(TEXT, TEXT) TO authenticated, service_role;

-- ── 3. Rattrapage : écoles déjà inscrites comme boutique ───────────────────
-- Ciblage strict : secteur 'education' resté dans sa configuration d'origine
-- (type, types et modules posés par l'ancien ELSE) ET jamais utilisé comme
-- boutique (aucun produit, aucune commande). Une école qui vend réellement
-- (fournitures, uniformes…) n'est pas touchée : un superadmin peut lui
-- ajouter les modules scolaires depuis le back office.

UPDATE public.businesses b
SET type     = 'education',
    types    = ARRAY['education'],
    features = ARRAY['eleves', 'classes', 'scolarite', 'notes', 'expenses']
WHERE b.industry_sector = 'education'
  AND b.type = 'retail'
  AND b.types = ARRAY['retail']
  AND b.features = ARRAY['retail', 'stock', 'expenses']
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.business_id = b.id)
  AND NOT EXISTS (SELECT 1 FROM public.orders   o WHERE o.business_id = b.id);
