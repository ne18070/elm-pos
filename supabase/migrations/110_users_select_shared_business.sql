-- Migration 110 : RLS users_select — voir les co-membres de TOUS ses businesses
--
-- Symptôme : sur une facture, le nom du caissier s'affiche « — » quand la vente
-- a été faite par un membre (souvent l'owner) dont le « business actif »
-- (users.business_id) pointe vers un AUTRE établissement. La jointure
-- `cashier:cashier_id(full_name, …)` est alors masquée par la RLS.
--
-- Cause : users_select ne laissait voir que
--   id = auth.uid()  OU  business_id = get_user_business_id()
-- c.-à-d. l'utilisateur lui-même + les membres dont le business ACTIF est le
-- mien. En multi-établissements, la source de vérité de l'appartenance est
-- `business_members`, pas `users.business_id`.
--
-- Fix : on autorise aussi la lecture d'un utilisateur avec qui je partage au
-- moins un business (via business_members). Fonction SECURITY DEFINER pour
-- éviter que la sous-requête soit elle-même filtrée par la RLS de
-- business_members (bm_select ne montre que le business actif + ses propres
-- lignes).

CREATE OR REPLACE FUNCTION public.shares_business_with(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM business_members bm_self
    JOIN business_members bm_other
      ON bm_other.business_id = bm_self.business_id
    WHERE bm_self.user_id  = auth.uid()
      AND bm_other.user_id  = p_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.shares_business_with(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "users_select" ON public.users;
CREATE POLICY "users_select" ON public.users FOR SELECT
  USING (
    id = auth.uid()
    OR business_id = get_user_business_id()
    OR public.shares_business_with(id)
  );
