-- Migration 026 : Système d'abonnements avec activation manuelle

-- ── Plans (gérés depuis le back office) ──────────────────────────────────────
CREATE TABLE plans (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  label         text        NOT NULL,
  price         numeric     NOT NULL DEFAULT 0,
  currency      text        NOT NULL DEFAULT 'XOF',
  duration_days int         NOT NULL DEFAULT 30,
  features      text[]      DEFAULT '{}',
  is_active     boolean     DEFAULT true,
  sort_order    int         DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

INSERT INTO plans (name, label, price, currency, duration_days, features, sort_order) VALUES
  ('starter', 'Starter', 5000, 'XOF', 30,
   ARRAY['1 établissement', '2 utilisateurs', 'Caisse + Commandes', 'Statistiques de base'], 1),
  ('pro', 'Pro', 12000, 'XOF', 30,
   ARRAY['Multi-établissements', 'Utilisateurs illimités', 'Toutes fonctionnalités', 'Comptabilité', 'Revendeurs'], 2);

-- ── Paramètres de paiement (singleton, géré depuis le back office) ───────────
CREATE TABLE payment_settings (
  id               int         PRIMARY KEY DEFAULT 1,
  wave_qr_url      text,
  om_qr_url        text,
  whatsapp_number  text        DEFAULT '+33746436801',
  updated_at       timestamptz DEFAULT now()
);
INSERT INTO payment_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ── Abonnements ───────────────────────────────────────────────────────────────
CREATE TABLE subscriptions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid        REFERENCES businesses(id) ON DELETE CASCADE NOT NULL UNIQUE,
  plan_id         uuid        REFERENCES plans(id),
  status          text        NOT NULL DEFAULT 'trial',
  -- 'trial' | 'active' | 'expired'
  trial_ends_at   timestamptz DEFAULT (now() + interval '7 days'),
  expires_at      timestamptz,
  activated_at    timestamptz,
  payment_note    text,
  created_at      timestamptz DEFAULT now()
);

-- ── Super admin ───────────────────────────────────────────────────────────────
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_superadmin boolean DEFAULT false;

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE plans            ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions    ENABLE ROW LEVEL SECURITY;

-- Plans : lecture publique, écriture superadmin
CREATE POLICY "plans_select" ON plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "plans_admin"  ON plans FOR ALL    TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true));

-- Paramètres paiement : lecture publique, écriture superadmin
CREATE POLICY "paysettings_select" ON payment_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "paysettings_admin"  ON payment_settings FOR ALL    TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true));

-- Abonnements : lecture par owner du business OU superadmin
CREATE POLICY "sub_select" ON subscriptions FOR SELECT TO authenticated
  USING (
    business_id = get_user_business_id()
    OR EXISTS (SELECT 1 FROM business_members WHERE business_id = subscriptions.business_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true)
  );
CREATE POLICY "sub_admin" ON subscriptions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true));

-- ── Trigger : créer un essai gratuit à la création d'un établissement ─────────
CREATE OR REPLACE FUNCTION create_trial_subscription()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO subscriptions (business_id, status, trial_ends_at)
  VALUES (NEW.id, 'trial', now() + interval '7 days')
  ON CONFLICT (business_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_business_created ON businesses;
CREATE TRIGGER on_business_created
  AFTER INSERT ON businesses
  FOR EACH ROW EXECUTE FUNCTION create_trial_subscription();

-- ── RPC : activer un abonnement (superadmin uniquement) ───────────────────────
CREATE OR REPLACE FUNCTION activate_subscription(
  p_business_id uuid,
  p_plan_id     uuid,
  p_days        int    DEFAULT 30,
  p_note        text   DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  INSERT INTO subscriptions (business_id, plan_id, status, expires_at, activated_at, payment_note)
  VALUES (p_business_id, p_plan_id, 'active', now() + (p_days || ' days')::interval, now(), p_note)
  ON CONFLICT (business_id) DO UPDATE SET
    plan_id      = p_plan_id,
    status       = 'active',
    expires_at   = now() + (p_days || ' days')::interval,
    activated_at = now(),
    payment_note = COALESCE(p_note, subscriptions.payment_note);
END;
$$;
GRANT EXECUTE ON FUNCTION activate_subscription(uuid, uuid, int, text) TO authenticated;

-- ── RPC : liste tous les abonnements (superadmin uniquement) ──────────────────
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
    s.business_id,
    b.name              AS business_name,
    p.label             AS plan_label,
    s.status,
    s.trial_ends_at,
    s.expires_at,
    s.activated_at,
    s.payment_note,
    u.email             AS owner_email,
    u.full_name         AS owner_name
  FROM subscriptions s
  JOIN businesses b ON b.id = s.business_id
  LEFT JOIN plans p ON p.id = s.plan_id
  LEFT JOIN business_members bm ON bm.business_id = s.business_id AND bm.role = 'owner'
  LEFT JOIN public.users u ON u.id = bm.user_id
  ORDER BY s.created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION get_all_subscriptions() TO authenticated;
