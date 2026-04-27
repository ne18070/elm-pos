-- ============================================================
-- Module Prestations de Service (flexible — lavage, billet,
-- réparation, mécanique, conseil, etc.)
-- ============================================================

-- Catalogue des types de prestations
CREATE TABLE IF NOT EXISTS service_catalog (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'autre',  -- 'lavage','vidange','mecanique','autre'
  price         NUMERIC(10,2) NOT NULL DEFAULT 0,
  duration_min  INT,                            -- durée estimée en minutes
  is_active     BOOLEAN NOT NULL DEFAULT true,
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_service_catalog_business ON service_catalog(business_id);

-- Sujets de service (générique : véhicule, appareil, billet, client…)
-- 'reference' est l'identifiant principal libre (plaque, n° série, nom, n° billet…)
-- 'type_sujet' permet au métier de qualifier ce qu'il suit (vehicule, appareil, billet, client, autre)
-- 'designation' est une description libre (marque + modèle + couleur, compagnie + vol, etc.)
CREATE TABLE IF NOT EXISTS service_subjects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  client_id       UUID REFERENCES clients(id) ON DELETE SET NULL,
  reference       TEXT NOT NULL,      -- identifiant principal (plaque, n° série, nom…)
  type_sujet      TEXT NOT NULL DEFAULT 'vehicule',
  designation     TEXT,               -- description libre (Toyota Corolla / iPhone 12 / DKR→CDG)
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_service_subjects_business ON service_subjects(business_id);
CREATE INDEX IF NOT EXISTS idx_service_subjects_ref      ON service_subjects(business_id, reference);

-- Ordres de travail / Bons de prestation (OT)
CREATE TABLE IF NOT EXISTS service_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_number    SERIAL,                       -- numéro interne affiché (OT-0001…)
  subject_id      UUID REFERENCES service_subjects(id) ON DELETE SET NULL,
  subject_ref     TEXT,               -- copie de service_subjects.reference
  subject_type    TEXT,               -- copie de service_subjects.type_sujet
  subject_info    TEXT,               -- copie de service_subjects.designation
  client_name     TEXT,
  client_phone    TEXT,
  status          TEXT NOT NULL DEFAULT 'attente'
                    CHECK (status IN ('attente','en_cours','termine','paye','annule')),
  total           NUMERIC(10,2) NOT NULL DEFAULT 0,
  paid_amount     NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_method  TEXT,
  notes           TEXT,
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  paid_at         TIMESTAMPTZ,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_service_orders_business   ON service_orders(business_id);
CREATE INDEX IF NOT EXISTS idx_service_orders_status     ON service_orders(business_id, status);
CREATE INDEX IF NOT EXISTS idx_service_orders_created_at ON service_orders(business_id, created_at DESC);

-- Lignes de prestation par OT
CREATE TABLE IF NOT EXISTS service_order_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  service_id  UUID REFERENCES service_catalog(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  price       NUMERIC(10,2) NOT NULL DEFAULT 0,
  quantity    INT NOT NULL DEFAULT 1,
  total       NUMERIC(10,2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_service_order_items_order ON service_order_items(order_id);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE service_catalog      ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_subjects     ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_order_items  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_catalog_member"     ON service_catalog;
DROP POLICY IF EXISTS "service_subjects_member"    ON service_subjects;
DROP POLICY IF EXISTS "service_orders_member"      ON service_orders;
DROP POLICY IF EXISTS "service_order_items_member" ON service_order_items;

CREATE POLICY "service_catalog_member" ON service_catalog
  FOR ALL TO authenticated
  USING  (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "service_subjects_member" ON service_subjects
  FOR ALL TO authenticated
  USING  (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "service_orders_member" ON service_orders
  FOR ALL TO authenticated
  USING  (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "service_order_items_member" ON service_order_items
  FOR ALL TO authenticated
  USING  (order_id IN (SELECT id FROM service_orders WHERE business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid())))
  WITH CHECK (order_id IN (SELECT id FROM service_orders WHERE business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid())));
