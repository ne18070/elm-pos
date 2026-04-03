-- Migration 063 : get_all_subscriptions groupé par owner (un compte = un abonnement)

DROP FUNCTION IF EXISTS get_all_subscriptions();

CREATE OR REPLACE FUNCTION get_all_subscriptions()
RETURNS TABLE (
  owner_id      uuid,
  owner_email   text,
  owner_name    text,
  business_id   uuid,
  business_name text,
  businesses    jsonb,    -- [{id, name}] tous les établissements du compte
  plan_label    text,
  status        text,
  trial_ends_at timestamptz,
  expires_at    timestamptz,
  activated_at  timestamptz,
  payment_note  text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  RETURN QUERY
  SELECT
    s.owner_id,
    u.email             AS owner_email,
    u.full_name         AS owner_name,
    s.business_id,
    b.name              AS business_name,
    -- Liste de tous les établissements dont l'user est membre (role owner ou admin)
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', biz.id, 'name', biz.name) ORDER BY biz.name)
      FROM business_members bm2
      JOIN businesses biz ON biz.id = bm2.business_id
      WHERE bm2.user_id = s.owner_id
    ), '[]'::jsonb)     AS businesses,
    p.label             AS plan_label,
    s.status,
    s.trial_ends_at,
    s.expires_at,
    s.activated_at,
    s.payment_note
  FROM subscriptions s
  LEFT JOIN public.users u  ON u.id  = s.owner_id
  LEFT JOIN businesses    b ON b.id  = s.business_id
  LEFT JOIN plans         p ON p.id  = s.plan_id
  ORDER BY s.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_all_subscriptions() TO authenticated;
