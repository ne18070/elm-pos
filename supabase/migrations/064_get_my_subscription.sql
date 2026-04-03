-- Migration 064 : get_my_subscription — résolution correcte pour owner ET staff/caissier
--
-- Problème : owner_id pointe vers le propriétaire, business_id vers UN seul établissement.
-- Un caissier d'un autre établissement du même owner ne trouve pas l'abonnement
-- via les colonnes directes.
--
-- Solution : RPC SECURITY DEFINER qui remonte via business_members.

CREATE OR REPLACE FUNCTION get_my_subscription()
RETURNS SETOF subscriptions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_biz_id   uuid;
  v_owner_id uuid;
BEGIN
  -- 1. L'utilisateur est lui-même l'owner du compte
  IF EXISTS (SELECT 1 FROM subscriptions WHERE owner_id = auth.uid()) THEN
    RETURN QUERY SELECT * FROM subscriptions WHERE owner_id = auth.uid();
    RETURN;
  END IF;

  -- 2. Trouver l'établissement actif de l'utilisateur
  SELECT business_id INTO v_biz_id FROM public.users WHERE id = auth.uid();

  IF v_biz_id IS NULL THEN
    RETURN;
  END IF;

  -- 3. Trouver l'owner de cet établissement via business_members
  SELECT user_id INTO v_owner_id
  FROM business_members
  WHERE business_id = v_biz_id AND role = 'owner'
  LIMIT 1;

  -- Fallback : via businesses.owner_id
  IF v_owner_id IS NULL THEN
    SELECT owner_id INTO v_owner_id FROM businesses WHERE id = v_biz_id;
  END IF;

  IF v_owner_id IS NULL THEN
    RETURN;
  END IF;

  -- 4. Retourner l'abonnement de cet owner
  RETURN QUERY SELECT * FROM subscriptions WHERE owner_id = v_owner_id LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_subscription() TO authenticated;
