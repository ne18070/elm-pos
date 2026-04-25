-- Migration 019 : Classification des revendeurs (type, zone, chef)
-- ============================================================

ALTER TABLE resellers
  ADD COLUMN IF NOT EXISTS type     TEXT NOT NULL DEFAULT 'gros'
    CONSTRAINT chk_reseller_type CHECK (type IN ('gros', 'demi_gros', 'detaillant')),
  ADD COLUMN IF NOT EXISTS zone     TEXT,
  ADD COLUMN IF NOT EXISTS chef_id  UUID REFERENCES resellers(id) ON DELETE SET NULL;

-- Index pour filtrer/grouper par zone et par type
CREATE INDEX IF NOT EXISTS idx_resellers_type    ON resellers(type);
CREATE INDEX IF NOT EXISTS idx_resellers_zone    ON resellers(zone);
CREATE INDEX IF NOT EXISTS idx_resellers_chef_id ON resellers(chef_id);
