-- RPC: get_or_create_profile
-- Returns the public.users row for the calling user.
-- If no row exists (trigger failed for admin-created accounts), creates it from auth metadata.

CREATE OR REPLACE FUNCTION get_or_create_profile()
RETURNS SETOF public.users
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_email    text;
  v_name     text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Return existing row if it exists
  IF EXISTS (SELECT 1 FROM public.users WHERE id = v_user_id) THEN
    RETURN QUERY SELECT * FROM public.users WHERE id = v_user_id;
    RETURN;
  END IF;

  -- Fetch auth metadata to create the missing row
  SELECT
    au.email,
    COALESCE(au.raw_user_meta_data->>'full_name', split_part(au.email, '@', 1))
  INTO v_email, v_name
  FROM auth.users au
  WHERE au.id = v_user_id;

  -- Create the profile
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (v_user_id, v_email, v_name, 'owner')
  ON CONFLICT (id) DO NOTHING;

  RETURN QUERY SELECT * FROM public.users WHERE id = v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_or_create_profile() TO authenticated;
