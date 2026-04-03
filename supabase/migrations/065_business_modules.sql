-- ─── Types d'établissement ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_types (
  id           text PRIMARY KEY,
  label        text NOT NULL,
  description  text,
  icon         text NOT NULL DEFAULT 'ShoppingBag',
  accent_color text NOT NULL DEFAULT 'brand',    -- 'brand' | 'orange' | 'purple' | 'teal'
  is_active    boolean NOT NULL DEFAULT true,
  sort_order   int     NOT NULL DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);

-- ─── Modules / fonctionnalités ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_modules (
  id          text PRIMARY KEY,
  label       text NOT NULL,
  description text,
  icon        text NOT NULL DEFAULT 'Package',
  is_core     boolean NOT NULL DEFAULT false,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  int     NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

-- ─── Matrice type × module ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_type_modules (
  business_type_id text NOT NULL REFERENCES business_types(id) ON DELETE CASCADE,
  module_id        text NOT NULL REFERENCES app_modules(id)    ON DELETE CASCADE,
  is_default       boolean NOT NULL DEFAULT true,
  PRIMARY KEY (business_type_id, module_id)
);

-- ─── Seed : types ─────────────────────────────────────────────────────────────
INSERT INTO business_types (id, label, description, icon, accent_color, sort_order) VALUES
  ('retail',     'Commerce / Boutique',   'Vente au détail, gestion de stock et livraisons aux clients', 'ShoppingBag', 'brand',  0),
  ('restaurant', 'Restaurant / Café',     'Restauration, bar, commandes en salle et à emporter',          'Utensils',   'orange', 1),
  ('service',    'Prestation de service', 'Factures, devis et services professionnels',                   'Briefcase',  'purple', 2),
  ('hotel',      'Hôtel / Hébergement',   'Chambres, réservations, check-in / check-out',                'BedDouble',  'teal',   3)
ON CONFLICT (id) DO NOTHING;

-- ─── Seed : modules ───────────────────────────────────────────────────────────
INSERT INTO app_modules (id, label, description, icon, is_core, sort_order) VALUES
  ('pos',              'Caisse & encaissement',    'Ventes, encaissement, tickets de caisse', 'ShoppingCart', true,  0),
  ('stock',            'Produits & stock',          'Catalogue produits, suivi du stock',      'Package',      false, 1),
  ('approvisionnement','Approvisionnement',          'Bons de commande fournisseurs',           'Warehouse',    false, 2),
  ('livraison',        'Livraisons',                'Gestion des livraisons clients',          'Truck',        false, 3),
  ('revendeurs',       'Revendeurs',                'Ventes en gros, tarifs revendeurs',       'Store',        false, 4),
  ('hotel',            'Module hôtel',              'Chambres, réservations, check-in/out',   'BedDouble',    false, 5),
  ('coupons',          'Coupons promotionnels',     'Codes promo et remises',                  'Tag',          false, 6),
  ('comptabilite',     'Comptabilité',              'Journal des opérations comptables',       'BookOpen',     false, 7)
ON CONFLICT (id) DO NOTHING;

-- ─── Seed : matrice ───────────────────────────────────────────────────────────
INSERT INTO business_type_modules (business_type_id, module_id, is_default) VALUES
  -- retail
  ('retail','pos',true),('retail','stock',true),('retail','approvisionnement',true),
  ('retail','livraison',true),('retail','revendeurs',true),('retail','coupons',true),
  ('retail','comptabilite',true),('retail','hotel',false),
  -- restaurant
  ('restaurant','pos',true),('restaurant','stock',true),('restaurant','approvisionnement',true),
  ('restaurant','livraison',true),('restaurant','revendeurs',false),('restaurant','coupons',true),
  ('restaurant','comptabilite',true),('restaurant','hotel',false),
  -- service
  ('service','pos',true),('service','stock',false),('service','approvisionnement',false),
  ('service','livraison',false),('service','revendeurs',false),('service','coupons',false),
  ('service','comptabilite',true),('service','hotel',false),
  -- hotel
  ('hotel','pos',false),('hotel','stock',false),('hotel','approvisionnement',false),
  ('hotel','livraison',false),('hotel','revendeurs',false),('hotel','coupons',true),
  ('hotel','comptabilite',true),('hotel','hotel',true)
ON CONFLICT DO NOTHING;

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE business_types        ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_modules           ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_type_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read business_types"        ON business_types        FOR SELECT TO authenticated USING (true);
CREATE POLICY "read app_modules"           ON app_modules           FOR SELECT TO authenticated USING (true);
CREATE POLICY "read business_type_modules" ON business_type_modules FOR SELECT TO authenticated USING (true);

CREATE POLICY "manage business_types"        ON business_types        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "manage app_modules"           ON app_modules           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "manage business_type_modules" ON business_type_modules FOR ALL TO authenticated USING (true) WITH CHECK (true);
