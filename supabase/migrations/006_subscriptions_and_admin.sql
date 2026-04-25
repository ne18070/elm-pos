-- File: 020_demo_account.sql
-- ============================================================
-- ELM APP — Compte démo complet
-- email    : demo@elm-pos.app
-- password : passer123
-- ============================================================
-- À exécuter dans Supabase Dashboard → SQL Editor

DO $$
DECLARE
  v_user_id     UUID := gen_random_uuid();
  v_business_id UUID := gen_random_uuid();
  v_order_id    UUID;
  v_reset_user  UUID;
  v_reset_biz   UUID;

  -- Catégories
  c_boissons    UUID := gen_random_uuid();
  c_snacks      UUID := gen_random_uuid();
  c_plats       UUID := gen_random_uuid();
  c_desserts    UUID := gen_random_uuid();
  c_epicerie    UUID := gen_random_uuid();

  -- Produits
  p_eau         UUID := gen_random_uuid();
  p_jus         UUID := gen_random_uuid();
  p_cafe        UUID := gen_random_uuid();
  p_bissap      UUID := gen_random_uuid();
  p_croissant   UUID := gen_random_uuid();
  p_chips       UUID := gen_random_uuid();
  p_poulet      UUID := gen_random_uuid();
  p_riz         UUID := gen_random_uuid();
  p_thiebou     UUID := gen_random_uuid();
  p_yassa       UUID := gen_random_uuid();
  p_glace       UUID := gen_random_uuid();
  p_gateau      UUID := gen_random_uuid();
  p_sucre       UUID := gen_random_uuid();
  p_lait        UUID := gen_random_uuid();
  p_pain        UUID := gen_random_uuid();

BEGIN

-- ─── 0. Reset : supprimer les données démo existantes ────────────────────────

SELECT id INTO v_reset_user FROM auth.users WHERE email = 'demo@elm-pos.app';

IF v_reset_user IS NOT NULL THEN
  SELECT id INTO v_reset_biz FROM businesses WHERE owner_id = v_reset_user LIMIT 1;

  IF v_reset_biz IS NOT NULL THEN
    DELETE FROM payments      WHERE order_id IN (SELECT id FROM orders WHERE business_id = v_reset_biz);
    DELETE FROM order_items   WHERE order_id IN (SELECT id FROM orders WHERE business_id = v_reset_biz);
    DELETE FROM orders        WHERE business_id = v_reset_biz;
    DELETE FROM stock_entries WHERE business_id = v_reset_biz;
    DELETE FROM products      WHERE business_id = v_reset_biz;
    DELETE FROM categories    WHERE business_id = v_reset_biz;
    DELETE FROM coupons           WHERE business_id = v_reset_biz;
    DELETE FROM business_members  WHERE business_id = v_reset_biz;
    
    -- Cleanup workflows (which don't always cascade perfectly)
    DELETE FROM workflow_instances WHERE workflow_id IN (SELECT id FROM workflows WHERE business_id = v_reset_biz);
    DELETE FROM workflows WHERE business_id = v_reset_biz;
    DELETE FROM pretentions WHERE business_id = v_reset_biz;

    UPDATE users SET business_id = NULL WHERE id = v_reset_user;
    DELETE FROM businesses WHERE id = v_reset_biz;
  END IF;

  DELETE FROM users      WHERE id = v_reset_user;
  DELETE FROM auth.users WHERE id = v_reset_user;
  RAISE NOTICE '🗑️  Données démo précédentes supprimées';
END IF;

-- ─── 1. Créer le compte Auth ───────────────────────────────────────────────

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  v_user_id,
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'demo@elm-pos.app',
  extensions.crypt('passer123', extensions.gen_salt('bf')),
  NOW(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Démo ELM APP","role":"owner"}',
  NOW(), NOW(),
  '', '', '', ''
);

-- ─── 2. Créer l'établissement démo ───────────────────────────────────────────

INSERT INTO businesses (
  id, name, type, address, phone, email,
  currency, tax_rate, receipt_footer, owner_id, stock_units
) VALUES (
  v_business_id,
  'Boutique Démo', 'retail',
  'Avenue Bourguiba, Dakar', '+221 77 000 00 00', 'demo@elm-pos.app',
  'XOF', 0, 'Merci de votre visite ! — ELM APP',
  v_user_id,
  '["pièce","kg","litre","sachet","carton","boîte"]'::jsonb
);

-- ─── 3. Lier l'utilisateur à l'établissement ─────────────────────────────────

-- public.users est créé par le trigger handle_new_user lors de l'INSERT auth.users
-- On met à jour business_id et role (le trigger crée la ligne avec business_id=NULL)
UPDATE users
SET full_name   = 'Démo ELM APP',
    role        = 'owner',
    business_id = v_business_id
WHERE id = v_user_id;

-- Alimenter business_members explicitement (source de vérité pour get_my_businesses)
INSERT INTO business_members (business_id, user_id, role)
VALUES (v_business_id, v_user_id, 'owner')
ON CONFLICT (business_id, user_id) DO UPDATE SET role = 'owner';

-- ─── 4. Catégories ───────────────────────────────────────────────────────────

INSERT INTO categories (id, business_id, name, color, icon, sort_order) VALUES
  (c_boissons, v_business_id, 'Boissons',  '#0ea5e9', '🥤', 0),
  (c_snacks,   v_business_id, 'Snacks',    '#f97316', '🍿', 1),
  (c_plats,    v_business_id, 'Plats',     '#22c55e', '🍽️', 2),
  (c_desserts, v_business_id, 'Desserts',  '#ec4899', '🍰', 3),
  (c_epicerie, v_business_id, 'Épicerie',  '#a855f7', '🛒', 4)
ON CONFLICT DO NOTHING;

-- ─── 5. Produits ─────────────────────────────────────────────────────────────

INSERT INTO products (id, business_id, category_id, name, price, barcode, track_stock, stock, unit, variants, is_active) VALUES

  -- Boissons
  (p_eau,      v_business_id, c_boissons, 'Eau minérale 500ml',  300,  '6111245100150', true,  48, 'pièce', '[]', true),
  (p_jus,      v_business_id, c_boissons, 'Jus de fruit 33cl',   500,  '6111245100151', true,  36, 'pièce', '[]', true),
  (p_cafe,     v_business_id, c_boissons, 'Café express',        400,  NULL,            false, NULL,'pièce', '[]', true),
  (p_bissap,   v_business_id, c_boissons, 'Jus bissap maison',   350,  NULL,            true,  20, 'litre', '[]', true),

  -- Snacks
  (p_croissant,v_business_id, c_snacks,   'Croissant beurre',    500,  '6111245100160', true,  15, 'pièce', '[]', true),
  (p_chips,    v_business_id, c_snacks,   'Chips 100g',          300,  '6111245100161', true,   3, 'sachet', '[]', true),

  -- Plats
  (p_poulet,   v_business_id, c_plats,    'Poulet braisé',      3500,  NULL,            false, NULL,'pièce', '[]', true),
  (p_riz,      v_business_id, c_plats,    'Riz au gras',        2000,  NULL,            false, NULL,'pièce', '[]', true),
  (p_thiebou,  v_business_id, c_plats,    'Thiébou dieune',     2500,  NULL,            false, NULL,'pièce', '[]', true),
  (p_yassa,    v_business_id, c_plats,    'Yassa poulet',       2500,  NULL,            false, NULL,'pièce', '[]', true),

  -- Desserts
  (p_glace,    v_business_id, c_desserts, 'Glace vanille',       500,  NULL,            true,   0, 'pièce', '[]', true),
  (p_gateau,   v_business_id, c_desserts, 'Gâteau chocolat',    1200,  NULL,            true,   8, 'pièce', '[]', true),

  -- Épicerie
  (p_sucre,    v_business_id, c_epicerie, 'Sucre 1kg',           600,  '6111245100170', true,  10, 'kg',    '[]', true),
  (p_lait,     v_business_id, c_epicerie, 'Lait concentré',      450,  '6111245100171', true,   2, 'boîte', '[]', true),
  (p_pain,     v_business_id, c_epicerie, 'Pain de mie',         500,  '6111245100172', true,   5, 'pièce', '[]', true)

ON CONFLICT DO NOTHING;

-- ─── 6. Coupon démo ──────────────────────────────────────────────────────────

INSERT INTO coupons (
  business_id, code, type, value, min_order_amount, max_uses, is_active
) VALUES
  (v_business_id, 'DEMO10',  'percentage', 10, 1000, 100, true),
  (v_business_id, 'BIENVENU','fixed',       500, 2000, 50,  true)
ON CONFLICT DO NOTHING;

-- ─── 7. Commandes de démonstration ───────────────────────────────────────────

-- Commande 1 : payée hier (espèces)
INSERT INTO orders (
  business_id, cashier_id, status, subtotal, tax_amount, discount_amount, total,
  delivery_status, created_at
) VALUES (
  v_business_id, v_user_id, 'paid', 4300, 0, 0, 4300,
  'delivered', NOW() - INTERVAL '1 day'
) RETURNING id INTO v_order_id;

INSERT INTO order_items (order_id, product_id, name, price, quantity, discount_amount, total) VALUES
  (v_order_id, p_thiebou, 'Thiébou dieune',    2500, 1, 0, 2500),
  (v_order_id, p_jus,     'Jus de fruit 33cl',  500, 2, 0, 1000),
  (v_order_id, p_eau,     'Eau minérale 500ml',  300, 2, 0,  600);

INSERT INTO payments (order_id, method, amount) VALUES (v_order_id, 'cash', 4300);

-- Commande 2 : payée aujourd'hui (mobile money)
INSERT INTO orders (
  business_id, cashier_id, status, subtotal, tax_amount, discount_amount, total,
  delivery_status, created_at
) VALUES (
  v_business_id, v_user_id, 'paid', 4700, 0, 380, 4320,
  'delivered', NOW() - INTERVAL '2 hours'
) RETURNING id INTO v_order_id;

INSERT INTO order_items (order_id, product_id, name, price, quantity, discount_amount, total) VALUES
  (v_order_id, p_poulet, 'Poulet braisé',    3500, 1, 350, 3150),
  (v_order_id, p_gateau, 'Gâteau chocolat',  1200, 1,  30, 1170);

INSERT INTO payments (order_id, method, amount) VALUES (v_order_id, 'mobile_money', 4320);

-- Commande 3 : en attente (acompte versé)
INSERT INTO orders (
  business_id, cashier_id, status, subtotal, tax_amount, discount_amount, total,
  customer_name, customer_phone, delivery_status, created_at
) VALUES (
  v_business_id, v_user_id, 'pending', 7500, 0, 0, 7500,
  'Aminata Diallo', '+221 77 123 45 67',
  'pending', NOW() - INTERVAL '30 minutes'
) RETURNING id INTO v_order_id;

INSERT INTO order_items (order_id, product_id, name, price, quantity, discount_amount, total) VALUES
  (v_order_id, p_yassa,   'Yassa poulet',       2500, 1, 0, 2500),
  (v_order_id, p_thiebou, 'Thiébou dieune',      2500, 1, 0, 2500),
  (v_order_id, p_bissap,  'Jus bissap maison',    350, 2, 0,  700),
  (v_order_id, p_eau,     'Eau minérale 500ml',   300, 3, 0,  900);

INSERT INTO payments (order_id, method, amount) VALUES (v_order_id, 'cash', 3000); -- acompte partiel

-- ─── 8. Historique d'approvisionnement ───────────────────────────────────────

INSERT INTO stock_entries (
  business_id, product_id, quantity,
  packaging_qty, packaging_size, packaging_unit,
  supplier, cost_per_unit, notes, created_by, created_at
) VALUES
  -- Eau minérale : 2 cartons de 24 bouteilles il y a 5 jours
  (v_business_id, p_eau,      48, 2,  24, 'carton', 'Kirène Dakar',    180, 'Stock initial',                  v_user_id, NOW() - INTERVAL '5 days'),
  -- Jus de fruit : 36 pièces il y a 5 jours
  (v_business_id, p_jus,      36, 3,  12, 'carton', 'Kirène Dakar',    320, 'Stock initial',                  v_user_id, NOW() - INTERVAL '5 days'),
  -- Bissap maison : 20 litres il y a 3 jours
  (v_business_id, p_bissap,   20, NULL, NULL, NULL, NULL,              150, 'Préparation maison',             v_user_id, NOW() - INTERVAL '3 days'),
  -- Croissant : 15 pièces ce matin
  (v_business_id, p_croissant,15, NULL, NULL, NULL, 'Boulangerie Amie', 280, 'Livraison du matin',            v_user_id, NOW() - INTERVAL '6 hours'),
  -- Chips : réapprovisionnement partiel (3 sachets restants = stock bas)
  (v_business_id, p_chips,    12, 1,  12, 'carton', 'Cash&Carry Dakar', 150, 'Réappro semaine dernière',      v_user_id, NOW() - INTERVAL '7 days'),
  -- Glace vanille : était à 5, tout vendu (stock = 0)
  (v_business_id, p_glace,     5, NULL, NULL, NULL, 'Patisserie Atlas',  350, 'Stock initial',                v_user_id, NOW() - INTERVAL '4 days'),
  -- Gâteau chocolat : 8 pièces il y a 2 jours
  (v_business_id, p_gateau,    8, NULL, NULL, NULL, 'Patisserie Atlas',  700, 'Commande spéciale',            v_user_id, NOW() - INTERVAL '2 days'),
  -- Sucre 1kg : 10 kg il y a 1 semaine
  (v_business_id, p_sucre,    10, 2,   5, 'sac',   'Cash&Carry Dakar',  420, 'Stock épicerie',               v_user_id, NOW() - INTERVAL '7 days'),
  -- Lait concentré : 6 boîtes (4 vendues → 2 restantes = stock bas)
  (v_business_id, p_lait,      6, 1,   6, 'carton','Nestlé Sénégal',    280, 'Stock initial',                v_user_id, NOW() - INTERVAL '6 days'),
  -- Pain de mie : 5 pièces ce matin
  (v_business_id, p_pain,      5, NULL, NULL, NULL, 'Boulangerie Amie',  300, 'Livraison du matin',          v_user_id, NOW() - INTERVAL '6 hours');

RAISE NOTICE '✅ Compte démo créé avec succès';
RAISE NOTICE '   Email    : demo@elm-pos.app';
RAISE NOTICE '   Password : passer123';
RAISE NOTICE '   Business : Boutique Démo (XOF)';
RAISE NOTICE '   Produits : 15 articles — 5 catégories';
RAISE NOTICE '   Commandes: 3 (1 livrée hier, 1 livrée auj., 1 acompte)';
RAISE NOTICE '   Appros   : 10 entrées de stock (eau, jus, bissap, croissant, chips, glace, gâteau, sucre, lait, pain)';
RAISE NOTICE '   Coupons  : DEMO10 (-10%%) + BIENVENU (-500 XOF)';
RAISE NOTICE '   Alertes  : chips (3), lait (2), glace (0) → stock bas';

END $$;


-- File: 026_subscriptions.sql
-- Migration 026 : Système d'abonnements avec activation manuelle

-- ── Plans (gérés depuis le back office) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS plans (
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

INSERT INTO plans (name, label, price, currency, duration_days, features, sort_order)
VALUES
  ('starter', 'Starter', 5000, 'XOF', 30,
   ARRAY['1 établissement', '2 utilisateurs', 'Caisse + Commandes', 'Statistiques de base'], 1),
  ('pro', 'Pro', 12000, 'XOF', 30,
   ARRAY['Multi-établissements', 'Utilisateurs illimités', 'Toutes fonctionnalités', 'Comptabilité', 'Revendeurs'], 2)
ON CONFLICT DO NOTHING;

-- ── Paramètres de paiement (singleton, géré depuis le back office) ───────────
CREATE TABLE IF NOT EXISTS payment_settings (
  id               int         PRIMARY KEY DEFAULT 1,
  wave_qr_url      text,
  om_qr_url        text,
  whatsapp_number  text        DEFAULT '+33746436801',
  updated_at       timestamptz DEFAULT now()
);
INSERT INTO payment_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ── Abonnements ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
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
DROP POLICY IF EXISTS "plans_select" ON plans;
CREATE POLICY "plans_select" ON plans FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "plans_admin" ON plans;
CREATE POLICY "plans_admin"  ON plans FOR ALL    TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true));

-- Paramètres paiement : lecture publique, écriture superadmin
DROP POLICY IF EXISTS "paysettings_select" ON payment_settings;
CREATE POLICY "paysettings_select" ON payment_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "paysettings_admin" ON payment_settings;
CREATE POLICY "paysettings_admin"  ON payment_settings FOR ALL    TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true));

-- Abonnements : lecture par owner du business OU superadmin
DROP POLICY IF EXISTS "sub_select" ON subscriptions;
CREATE POLICY "sub_select" ON subscriptions FOR SELECT TO authenticated
  USING (
    business_id = get_user_business_id()
    OR EXISTS (SELECT 1 FROM business_members WHERE business_id = subscriptions.business_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true)
  );

DROP POLICY IF EXISTS "sub_admin" ON subscriptions;
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


-- File: 027_create_superadmin.sql
-- Migration 027 : Créer le super administrateur ELM APP
-- À exécuter dans Supabase Dashboard > SQL Editor
-- Remplacez l'email par le vôtre avant d'exécuter.

UPDATE public.users
SET is_superadmin = true
WHERE email = 'admin@elm-pos.app';


-- File: 028_fix_get_all_subscriptions.sql
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


-- File: 030_subscription_requests.sql
-- ── Table des demandes d'abonnement ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.subscription_requests (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id  uuid        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  plan_id      uuid        REFERENCES public.plans(id),
  receipt_url  text        NOT NULL,
  status       text        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'approved', 'rejected')),
  note         text,
  created_at   timestamptz DEFAULT now(),
  processed_at timestamptz,
  processed_by uuid        REFERENCES public.users(id)
);

ALTER TABLE public.subscription_requests ENABLE ROW LEVEL SECURITY;

-- Les membres d'un établissement peuvent soumettre une demande
DROP POLICY IF EXISTS "sr_insert" ON public.subscription_requests;
CREATE POLICY "sr_insert" ON public.subscription_requests
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND business_id = subscription_requests.business_id
    )
  );

-- Lecture : ses propres demandes ou superadmin
DROP POLICY IF EXISTS "sr_select" ON public.subscription_requests;
CREATE POLICY "sr_select" ON public.subscription_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND (business_id = subscription_requests.business_id OR is_superadmin = true)
    )
  );

-- Mise à jour : superadmin seulement (approbation / rejet)
DROP POLICY IF EXISTS "sr_update" ON public.subscription_requests;
CREATE POLICY "sr_update" ON public.subscription_requests
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true)
  );

-- ── Bucket receipts (réutilise product-images, sous-dossier receipts/) ───────
-- Les utilisateurs authentifiés peuvent uploader leurs reçus
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'product-images' AND name LIKE 'receipts/%'
    LIMIT 1
  ) THEN NULL; END IF; -- bucket déjà existant, juste vérification
END $$;

-- Politique d'upload des reçus (INSERT dans product-images/receipts/*)
DROP POLICY IF EXISTS "receipts_insert" ON storage.objects;
CREATE POLICY "receipts_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'product-images'
    AND name LIKE 'receipts/%'
    AND auth.role() = 'authenticated'
  );


-- File: 031_public_subscription_requests.sql
-- ── Demandes d'abonnement publiques (prospects sans compte) ──────────────────

CREATE TABLE IF NOT EXISTS public.public_subscription_requests (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  business_name text        NOT NULL,
  email         text        NOT NULL,
  phone         text,
  plan_id       uuid        REFERENCES public.plans(id),
  receipt_url   text        NOT NULL,
  status        text        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'approved', 'rejected')),
  note          text,
  created_at    timestamptz DEFAULT now(),
  processed_at  timestamptz,
  processed_by  uuid        REFERENCES public.users(id)
);

ALTER TABLE public.public_subscription_requests ENABLE ROW LEVEL SECURITY;

-- Tout le monde (anonyme inclus) peut insérer une demande
DROP POLICY IF EXISTS "psr_insert_anon" ON public.public_subscription_requests;
CREATE POLICY "psr_insert_anon" ON public.public_subscription_requests
  FOR INSERT WITH CHECK (true);

-- Seul le superadmin peut lire et modifier
DROP POLICY IF EXISTS "psr_superadmin" ON public.public_subscription_requests;
CREATE POLICY "psr_superadmin" ON public.public_subscription_requests
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true)
  );

-- Permettre à l'utilisateur anonyme d'uploader dans product-images/receipts/
-- (La politique receipts_insert de la migration 030 couvre déjà les authentifiés ;
--  on ajoute une politique pour les anonymes sur le sous-dossier public-*)
DROP POLICY IF EXISTS "receipts_insert_anon" ON storage.objects;
CREATE POLICY "receipts_insert_anon" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'product-images'
    AND name LIKE 'receipts/public-%'
  );


-- File: 040_public_subscription_password.sql
-- Add password field to public_subscription_requests
-- Nullable for backward compatibility with existing records

ALTER TABLE public.public_subscription_requests
  ADD COLUMN IF NOT EXISTS password text;

-- Also make receipt_url nullable (needed for free plans)
ALTER TABLE public.public_subscription_requests
  ALTER COLUMN receipt_url DROP NOT NULL;


-- File: 041_plans_anon_read.sql
-- Allow anonymous (unauthenticated) users to read plans and payment_settings.
-- Needed for the public /subscribe page where no user session exists yet.

DROP POLICY IF EXISTS "plans_select_anon" ON public.plans;
CREATE POLICY "plans_select_anon"
  ON public.plans FOR SELECT TO anon USING (is_active = true);

DROP POLICY IF EXISTS "paysettings_select_anon" ON public.payment_settings;
CREATE POLICY "paysettings_select_anon"
  ON public.payment_settings FOR SELECT TO anon USING (true);


-- File: 062_subscription_by_owner.sql
-- Migration 062 : Abonnement par compte propriétaire (owner) et non par établissement
-- Un owner = un abonnement, valable pour tous ses établissements.

-- ── 1. Ajouter la colonne owner_id ───────────────────────────────────────────
-- Pas de FK sur users — certains user_id viennent de auth.users sans profil public.users
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS owner_id UUID;

-- ── 2. Remplir owner_id depuis business_members (role = owner) ───────────────
UPDATE subscriptions s
SET owner_id = bm.user_id
FROM business_members bm
WHERE bm.business_id = s.business_id
  AND bm.role = 'owner'
  AND s.owner_id IS NULL;

-- Fallback : depuis businesses.owner_id si disponible
UPDATE subscriptions s
SET owner_id = b.owner_id
FROM businesses b
WHERE b.id = s.business_id
  AND s.owner_id IS NULL
  AND b.owner_id IS NOT NULL;

-- ── 3. Dédupliquer : pour les owners avec plusieurs abonnements,
--       garder le plus favorable (active > trial > expired, puis le plus récent)
DELETE FROM subscriptions
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY owner_id
        ORDER BY
          CASE status WHEN 'active' THEN 1 WHEN 'trial' THEN 2 ELSE 3 END,
          COALESCE(expires_at, trial_ends_at, created_at) DESC
      ) AS rn
    FROM subscriptions
    WHERE owner_id IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- ── 4. Contrainte UNIQUE sur owner_id (un seul abonnement par compte) ────────
ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_owner_id_key;
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_owner_id_key UNIQUE (owner_id);

-- ── 5. Mettre à jour le trigger : créer un abonnement par owner, pas par business ──
CREATE OR REPLACE FUNCTION create_trial_subscription()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner_id UUID;
BEGIN
  -- Trouver le propriétaire du business
  SELECT user_id INTO v_owner_id
  FROM business_members
  WHERE business_id = NEW.id AND role = 'owner'
  LIMIT 1;

  -- Fallback sur businesses.owner_id si disponible
  IF v_owner_id IS NULL THEN
    SELECT owner_id INTO v_owner_id FROM businesses WHERE id = NEW.id;
  END IF;

  IF v_owner_id IS NULL THEN
    RETURN NEW; -- pas d'owner trouvé, on ne fait rien
  END IF;

  -- Créer un essai seulement si ce owner n'en a pas déjà un
  INSERT INTO subscriptions (business_id, owner_id, status, trial_ends_at)
  VALUES (NEW.id, v_owner_id, 'trial', now() + interval '7 days')
  ON CONFLICT (owner_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ── 6. Mettre à jour activate_subscription pour utiliser owner_id ─────────────
CREATE OR REPLACE FUNCTION activate_subscription(
  p_business_id UUID,
  p_plan_id     UUID,
  p_days        INT    DEFAULT 30,
  p_note        TEXT   DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  -- Résoudre l'owner depuis le business
  SELECT user_id INTO v_owner_id
  FROM business_members
  WHERE business_id = p_business_id AND role = 'owner'
  LIMIT 1;

  IF v_owner_id IS NULL THEN
    SELECT owner_id INTO v_owner_id FROM businesses WHERE id = p_business_id;
  END IF;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Aucun propriétaire trouvé pour cet établissement';
  END IF;

  INSERT INTO subscriptions (business_id, owner_id, plan_id, status, expires_at, activated_at, payment_note)
  VALUES (p_business_id, v_owner_id, p_plan_id, 'active', now() + (p_days || ' days')::interval, now(), p_note)
  ON CONFLICT (owner_id) DO UPDATE SET
    business_id  = p_business_id,
    plan_id      = p_plan_id,
    status       = 'active',
    expires_at   = now() + (p_days || ' days')::interval,
    activated_at = now(),
    payment_note = COALESCE(p_note, subscriptions.payment_note);
END;
$$;
GRANT EXECUTE ON FUNCTION activate_subscription(uuid, uuid, int, text) TO authenticated;

-- ── 7. Mettre à jour la RLS pour permettre la lecture par owner_id ─────────────
DROP POLICY IF EXISTS "sub_select" ON subscriptions;
CREATE POLICY "sub_select" ON subscriptions FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR business_id = get_user_business_id()
    OR EXISTS (SELECT 1 FROM business_members WHERE business_id = subscriptions.business_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true)
  );


-- File: 063_get_all_subscriptions_by_owner.sql
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
    p.price             AS plan_price,
    p.currency          AS plan_currency,
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


-- File: 086_superadmin_monitoring.sql
-- ─── Permissions Monitoring pour Superadmins ─────────────────────────────────
-- Migration 086 : Autoriser les superadmins à voir les données globales pour le monitoring.

-- Fonction helper pour vérifier si l'utilisateur est superadmin
-- (Déjà utilisée dans d'autres migrations, on s'assure qu'elle est accessible)
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean AS $$
  SELECT COALESCE(is_superadmin, false) FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- 1. Businesses
DROP POLICY IF EXISTS "superadmin_select_all_businesses" ON public.businesses;
CREATE POLICY "superadmin_select_all_businesses" ON public.businesses
  FOR SELECT TO authenticated USING (public.is_superadmin());

DROP POLICY IF EXISTS "superadmin_update_all_businesses" ON public.businesses;
CREATE POLICY "superadmin_update_all_businesses" ON public.businesses
  FOR UPDATE TO authenticated USING (public.is_superadmin());

-- 2. Orders
DROP POLICY IF EXISTS "superadmin_select_all_orders" ON public.orders;
CREATE POLICY "superadmin_select_all_orders" ON public.orders
  FOR SELECT TO authenticated USING (public.is_superadmin());

-- 3. Business Members
DROP POLICY IF EXISTS "superadmin_select_all_members" ON public.business_members;
CREATE POLICY "superadmin_select_all_members" ON public.business_members
  FOR SELECT TO authenticated USING (public.is_superadmin());

-- 4. Products
DROP POLICY IF EXISTS "superadmin_select_all_products" ON public.products;
CREATE POLICY "superadmin_select_all_products" ON public.products
  FOR SELECT TO authenticated USING (public.is_superadmin());

-- 5. Subscriptions (déjà géré par get_all_subscriptions RPC mais pour être sûr)
DROP POLICY IF EXISTS "superadmin_select_all_subscriptions" ON public.subscriptions;
CREATE POLICY "superadmin_select_all_subscriptions" ON public.subscriptions
  FOR SELECT TO authenticated USING (public.is_superadmin());


-- File: 094_update_subscription_requests.sql
-- Migration 094 : Mise à jour des demandes d'abonnement pour inclure le nom complet et la dénomination
-- Permet de séparer les infos de l'utilisateur (Admin) de celles de l'entreprise (Structure)

ALTER TABLE public.public_subscription_requests
ADD COLUMN IF NOT EXISTS full_name    TEXT,
ADD COLUMN IF NOT EXISTS denomination TEXT;

-- Rendre receipt_url optionnel si on veut permettre l'envoi sans reçu immédiat
ALTER TABLE public.public_subscription_requests
ALTER COLUMN receipt_url DROP NOT NULL;

-- Ajouter password pour stocker temporairement le MDP choisi
ALTER TABLE public.public_subscription_requests
ADD COLUMN IF NOT EXISTS password TEXT;
