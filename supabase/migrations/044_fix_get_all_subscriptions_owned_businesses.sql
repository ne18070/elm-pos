-- Fix get_all_subscriptions business list.
-- The backoffice monitoring must show businesses owned by the subscription owner,
-- not every business where that user is a member/admin.

DROP FUNCTION IF EXISTS get_all_subscriptions();

CREATE OR REPLACE FUNCTION get_all_subscriptions()
RETURNS TABLE (
  owner_id      uuid,
  owner_email   text,
  owner_name    text,
  business_id   uuid,
  business_name text,
  businesses    jsonb,
  plan_label    text,
  plan_price    numeric,
  plan_currency text,
  status        text,
  trial_ends_at timestamptz,
  expires_at    timestamptz,
  activated_at  timestamptz,
  payment_note  text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true
  ) THEN
    RAISE EXCEPTION 'Acces refuse';
  END IF;

  RETURN QUERY
  SELECT
    s.owner_id,
    u.email             AS owner_email,
    u.full_name         AS owner_name,
    s.business_id,
    b.name              AS business_name,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', biz.id, 'name', biz.name) ORDER BY biz.name)
      FROM businesses biz
      WHERE biz.owner_id = s.owner_id
         OR biz.id = s.business_id
    ), '[]'::jsonb)     AS businesses,
    p.label             AS plan_label,
    p.price             AS plan_price,
    p.currency          AS plan_currency,
    s.status,
    s.trial_ends_at,
    s.expires_at,
    s.activated_at,
    s.payment_note
  FROM subscriptions s
  LEFT JOIN public.users u  ON u.id = s.owner_id
  LEFT JOIN businesses b    ON b.id = s.business_id
  LEFT JOIN plans p         ON p.id = s.plan_id
  ORDER BY s.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_all_subscriptions() TO authenticated;
