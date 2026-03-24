-- Migration 023 : RPC pour assigner un user à un business après sa création
-- Permet à un admin/owner de lier un nouvel utilisateur à son établissement
-- en contournant la RLS (SECURITY DEFINER)

CREATE OR REPLACE FUNCTION assign_user_to_business(
  p_email       TEXT,
  p_full_name   TEXT,
  p_role        TEXT,
  p_business_id UUID
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Vérifier que l'appelant est admin/owner du business cible
  -- (via business_members OU via users.business_id pour rétro-compatibilité)
  IF NOT EXISTS (
    SELECT 1 FROM public.business_members
    WHERE user_id = auth.uid()
      AND business_id = p_business_id
      AND role IN ('admin', 'owner')
  ) AND NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
      AND business_id = p_business_id
      AND role IN ('admin', 'owner')
  ) THEN
    RAISE EXCEPTION 'Permission refusée pour ce business';
  END IF;

  -- Récupérer l'UUID depuis auth.users
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = p_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur introuvable dans auth.users';
  END IF;

  -- Insérer ou mettre à jour le profil dans public.users
  INSERT INTO public.users (id, email, full_name, role, business_id)
  VALUES (v_user_id, p_email, NULLIF(p_full_name, ''), p_role, p_business_id)
  ON CONFLICT (id) DO UPDATE SET
    full_name   = COALESCE(NULLIF(p_full_name, ''), public.users.full_name),
    role        = p_role,
    business_id = p_business_id;

  -- Ajouter dans business_members (le trigger peut ne pas s'exécuter depuis SECURITY DEFINER)
  INSERT INTO public.business_members (business_id, user_id, role)
  VALUES (p_business_id, v_user_id, p_role)
  ON CONFLICT (business_id, user_id)
    DO UPDATE SET role = p_role;
END;
$$;
