-- Migration 024 : Fix RLS business_members pour le multi-établissements
-- La policy "bm_select" ne laissait voir que les membres du business actif,
-- empêchant get_my_businesses() de retourner tous les établissements de l'utilisateur.

DROP POLICY IF EXISTS "bm_select" ON business_members;

CREATE POLICY "bm_select" ON business_members FOR SELECT
  USING (
    business_id = get_user_business_id()   -- voir tous les membres de l'établissement actif
    OR user_id = auth.uid()                -- voir ses propres memberships (switcher multi-business)
  );
