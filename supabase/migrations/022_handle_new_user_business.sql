-- Migration 022 : handle_new_user inclut business_id depuis les métadonnées
-- Permet de créer un membre d'équipe via signUp() sans Edge Function

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO users (id, email, full_name, role, business_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'staff'),
    NULLIF(NEW.raw_user_meta_data->>'business_id', '')::uuid
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name   = EXCLUDED.full_name,
    role        = EXCLUDED.role,
    business_id = COALESCE(EXCLUDED.business_id, users.business_id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Ne jamais bloquer la création du compte auth même si le profil échoue
  RETURN NEW;
END;
$$;
