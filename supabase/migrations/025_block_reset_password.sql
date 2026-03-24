-- Migration 025 : Bloquer un utilisateur + réinitialiser son mot de passe (owner only)

-- 1. Colonne is_blocked sur public.users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false;

-- 2. RPC : bloquer / débloquer un membre (owner du business uniquement)
CREATE OR REPLACE FUNCTION toggle_user_block(
  p_business_id uuid,
  p_user_id     uuid,
  p_blocked     boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Vérifier que l'appelant est owner du business
  IF NOT EXISTS (
    SELECT 1 FROM business_members
    WHERE business_id = p_business_id
      AND user_id     = auth.uid()
      AND role        = 'owner'
  ) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  -- Impossible de bloquer un owner
  IF EXISTS (
    SELECT 1 FROM business_members
    WHERE business_id = p_business_id
      AND user_id     = p_user_id
      AND role        = 'owner'
  ) THEN
    RAISE EXCEPTION 'Impossible de bloquer un propriétaire';
  END IF;

  UPDATE public.users SET is_blocked = p_blocked WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION toggle_user_block(uuid, uuid, boolean) TO authenticated;

-- 3. RPC : réinitialiser le mot de passe d'un membre (owner du business uniquement)
--    Utilise pgcrypto (disponible par défaut dans Supabase) pour hasher le mot de passe.
CREATE OR REPLACE FUNCTION admin_reset_user_password(
  p_business_id uuid,
  p_user_id     uuid,
  p_new_password text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  -- Vérifier que l'appelant est owner du business
  IF NOT EXISTS (
    SELECT 1 FROM business_members
    WHERE business_id = p_business_id
      AND user_id     = auth.uid()
      AND role        = 'owner'
  ) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  -- Mettre à jour le mot de passe dans auth.users
  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      updated_at         = now()
  WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_reset_user_password(uuid, uuid, text) TO authenticated;
