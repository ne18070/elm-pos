-- Sync email from auth.users → public.users when the owner changes their email
-- (the existing trigger only fires on INSERT, not on UPDATE)

CREATE OR REPLACE FUNCTION handle_auth_user_email_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.users SET email = NEW.email WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
CREATE TRIGGER on_auth_user_email_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_auth_user_email_update();

GRANT EXECUTE ON FUNCTION handle_auth_user_email_update() TO service_role;
