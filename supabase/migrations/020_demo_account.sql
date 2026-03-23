-- ============================================================
-- Elm POS — Compte démo complet
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
    DELETE FROM coupons       WHERE business_id = v_reset_biz;
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
  crypt('passer123', gen_salt('bf')),
  NOW(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Démo Elm POS","role":"owner"}',
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
  'XOF', 0, 'Merci de votre visite ! — Elm POS',
  v_user_id,
  '["pièce","kg","litre","sachet","carton","boîte"]'::jsonb
);

-- ─── 3. Lier l'utilisateur à l'établissement ─────────────────────────────────

UPDATE users
SET
  full_name   = 'Démo Elm POS',
  role        = 'owner',
  business_id = v_business_id
WHERE id = v_user_id;

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
