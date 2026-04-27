-- Migration 027 : Catégories de services dynamiques

CREATE TABLE IF NOT EXISTS service_categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  color         TEXT DEFAULT 'bg-slate-500/20 text-slate-300',
  sort_order    INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_categories_business ON service_categories(business_id);

-- Activer RLS
ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_categories_member" ON service_categories
  FOR ALL TO authenticated
  USING  (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

-- Ajouter category_id à service_catalog
ALTER TABLE service_catalog ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES service_categories(id) ON DELETE SET NULL;

-- Optionnel : Migrer les anciennes catégories vers la nouvelle table
-- Pour l'instant on garde le champ TEXT 'category' pour la compatibilité, 
-- mais on privilégiera category_id.
