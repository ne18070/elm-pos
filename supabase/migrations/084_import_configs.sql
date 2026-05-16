-- Migration 084 : Import configurations (connexions DB externes sauvegardées)
-- Les credentials sont stockés dans le JSONB connection (pas de chiffrement côté
-- SQL — la protection est assurée par RLS : chaque business ne voit que les siens).

CREATE TABLE IF NOT EXISTS import_configs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  source_type   TEXT        NOT NULL CHECK (source_type IN ('postgresql', 'mysql')),
  connection    JSONB       NOT NULL,   -- { host, port, database, user, password }
  source_table  TEXT        NOT NULL,
  target_entity TEXT        NOT NULL CHECK (target_entity IN ('products', 'clients', 'categories', 'staff', 'stock_entries', 'orders')),
  column_map    JSONB       NOT NULL,   -- [{ source, target, multiplier? }]
  last_run_at   TIMESTAMPTZ,
  last_count    INTEGER     DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE import_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_configs_select" ON import_configs FOR SELECT
  USING (business_id = get_user_business_id());

CREATE POLICY "import_configs_insert" ON import_configs FOR INSERT
  WITH CHECK (
    business_id = get_user_business_id() AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('owner','admin'))
  );

CREATE POLICY "import_configs_update" ON import_configs FOR UPDATE
  USING (
    business_id = get_user_business_id() AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('owner','admin'))
  );

CREATE POLICY "import_configs_delete" ON import_configs FOR DELETE
  USING (
    business_id = get_user_business_id() AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('owner','admin'))
  );

-- Index pour lister les configs d'un business
CREATE INDEX IF NOT EXISTS import_configs_biz_idx ON import_configs (business_id, created_at DESC);
