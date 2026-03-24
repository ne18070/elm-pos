-- Migration 028 : Corriger get_all_subscriptions pour afficher tous les établissements
-- même ceux sans abonnement créé (avant migration 026)

-- Créer les abonnements manquants (trial) pour les businesses existants
INSERT INTO subscriptions (business_id, status, trial_ends_at)
SELECT id, 'trial', now() + interval '7 days'
FROM businesses
WHERE id NOT IN (SELECT business_id FROM subscriptions)
ON CONFLICT (business_id) DO NOTHING;

-- Réécrire la RPC en partant de businesses (LEFT JOIN sur subscriptions)
CREATE OR REPLACE FUNCTION get_all_subscriptions()
RETURNS TABLE (
  business_id   uuid,
  business_name text,
  plan_label    text,
  status        text,
  trial_ends_at timestamptz,
  expires_at    timestamptz,
  activated_at  timestamptz,
  payment_note  text,
  owner_email   text,
  owner_name    text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  RETURN QUERY
  SELECT
    b.id                AS business_id,
    b.name              AS business_name,
    p.label             AS plan_label,
    COALESCE(s.status, 'none') AS status,
    s.trial_ends_at,
    s.expires_at,
    s.activated_at,
    s.payment_note,
    u.email             AS owner_email,
    u.full_name         AS owner_name
  FROM businesses b
  LEFT JOIN subscriptions s  ON s.business_id = b.id
  LEFT JOIN plans p          ON p.id = s.plan_id
  LEFT JOIN business_members bm ON bm.business_id = b.id AND bm.role = 'owner'
  LEFT JOIN public.users u   ON u.id = bm.user_id
  ORDER BY b.name;
END;
$$;
