-- Menu du jour : sélection de produits mis en avant pour une date donnée
CREATE TABLE IF NOT EXISTS daily_menus (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  note        TEXT,                     -- message affiché en intro (ex: "Spécial week-end 🎉")
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, date)
);

CREATE TABLE IF NOT EXISTS daily_menu_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_menu_id UUID NOT NULL REFERENCES daily_menus(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  custom_price  NUMERIC,               -- prix spécial optionnel pour ce jour
  sort_order    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (daily_menu_id, product_id)
);

-- RLS
ALTER TABLE daily_menus       ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_menu_items  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_menus: members" ON daily_menus;
CREATE POLICY "daily_menus: members"
  ON daily_menus FOR ALL
  USING (business_id IN (
    SELECT business_id FROM business_members WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "daily_menu_items: members" ON daily_menu_items;
CREATE POLICY "daily_menu_items: members"
  ON daily_menu_items FOR ALL
  USING (daily_menu_id IN (
    SELECT dm.id FROM daily_menus dm
    JOIN business_members bm ON bm.business_id = dm.business_id
    WHERE bm.user_id = auth.uid()
  ));

-- Service role pour Edge Function WhatsApp
DROP POLICY IF EXISTS "daily_menus: service_role" ON daily_menus;
CREATE POLICY "daily_menus: service_role"
  ON daily_menus FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "daily_menu_items: service_role" ON daily_menu_items;
CREATE POLICY "daily_menu_items: service_role"
  ON daily_menu_items FOR ALL USING (auth.role() = 'service_role');
