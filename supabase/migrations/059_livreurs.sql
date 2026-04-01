CREATE TABLE livreurs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS livreur_id UUID REFERENCES livreurs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_livreurs_business ON livreurs(business_id) WHERE is_active;

ALTER TABLE livreurs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "livreurs: members read" ON livreurs FOR SELECT USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));
CREATE POLICY "livreurs: manager write" ON livreurs FOR ALL USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid() AND role IN ('owner','admin','manager')));
CREATE POLICY "livreurs: service_role" ON livreurs FOR ALL USING (auth.role() = 'service_role');
