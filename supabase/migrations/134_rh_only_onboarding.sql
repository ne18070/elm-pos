-- ============================================================================
-- Migration 134 : Onboarding pour une organisation "RH / SIRH uniquement"
--
-- Jusqu'ici aucun secteur de `create_business_v2` (038_onboarding_complete.sql)
-- ne posait `'staff'` dans `businesses.features` — une entreprise qui ne veut
-- QUE le module RH (pas de caisse/stock/vente) n'avait aucun chemin
-- d'onboarding cohérent : elle devait choisir un secteur retail/restaurant/…
-- et se retrouvait avec des sections de nav vides (POS, Stock…) sans jamais
-- avoir accès à /staff.
--
-- On ajoute un secteur 'rh' à `create_business_v2` : type='service' (valeur
-- déjà acceptée par businesses_type_check, aucune migration de contrainte
-- nécessaire) + features=['staff'] uniquement. Grâce au filtrage déjà en
-- place dans renderer/components/shared/Sidebar.tsx (sections vides retirées
-- automatiquement) et renderer/lib/permissions.ts (hasFeature), la sidebar
-- se réduit naturellement à Finance (Tableau de bord) + Administration
-- (dont Équipe & Paie) sans qu'aucun nouveau `BusinessType`, contrainte CHECK
-- ou entrée `NAV_BY_TYPE` ne soit nécessaire.
--
-- `seed_demo_data` n'a pas besoin d'être modifiée : le secteur 'rh' ne
-- correspond à aucune de ses branches IF/ELSIF, donc elle ne crée
-- simplement aucune donnée de démo (comportement voulu — rien à démontrer
-- sans employés).
-- ============================================================================

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
      v_type     := 'service';
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
