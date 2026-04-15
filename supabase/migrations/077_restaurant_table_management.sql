-- ============================================================
-- ELM APP — Restaurant Table Management & Floor Plan
-- ============================================================

-- 1. Floors / Areas (Main Hall, Terrace, etc.)
CREATE TABLE IF NOT EXISTS restaurant_floors (
  id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id  UUID         NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name         TEXT         NOT NULL,
  position     INTEGER      DEFAULT 0,
  is_active    BOOLEAN      DEFAULT true,
  created_at   TIMESTAMPTZ  DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  DEFAULT NOW()
);

-- 2. Tables
CREATE TYPE table_shape AS ENUM ('square', 'round', 'rectangle');
CREATE TYPE table_status AS ENUM ('free', 'occupied', 'reserved', 'cleaning');

CREATE TABLE IF NOT EXISTS restaurant_tables (
  id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id  UUID         NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  floor_id     UUID         NOT NULL REFERENCES restaurant_floors(id) ON DELETE CASCADE,
  name         TEXT         NOT NULL,
  capacity     INTEGER      DEFAULT 2,
  shape        table_shape  DEFAULT 'square',
  
  -- Position for visual map (0-100 percentage or grid coords)
  pos_x        INTEGER      DEFAULT 0,
  pos_y        INTEGER      DEFAULT 0,
  width        INTEGER      DEFAULT 60,
  height       INTEGER      DEFAULT 60,
  rotation     INTEGER      DEFAULT 0,
  
  status       table_status DEFAULT 'free',
  current_order_id UUID, -- NULL if free
  
  is_active    BOOLEAN      DEFAULT true,
  created_at   TIMESTAMPTZ  DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  DEFAULT NOW()
);

-- 3. Link orders to tables
ALTER TABLE orders 
ADD COLUMN table_id UUID REFERENCES restaurant_tables(id) ON DELETE SET NULL;

-- 4. Indexes
CREATE INDEX idx_tables_business ON restaurant_tables(business_id);
CREATE INDEX idx_tables_floor ON restaurant_tables(floor_id);
CREATE INDEX idx_orders_table ON orders(table_id);

-- 5. RLS
ALTER TABLE restaurant_floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "floors_select" ON restaurant_floors FOR SELECT USING (business_id = get_user_business_id());
CREATE POLICY "floors_manage" ON restaurant_floors FOR ALL USING (business_id = get_user_business_id() AND get_user_role() IN ('admin','owner','manager'));

CREATE POLICY "tables_select" ON restaurant_tables FOR SELECT USING (business_id = get_user_business_id());
CREATE POLICY "tables_manage" ON restaurant_tables FOR ALL USING (business_id = get_user_business_id() AND get_user_role() IN ('admin','owner','manager'));

-- 6. Trigger to update table status when an order is created
CREATE OR REPLACE FUNCTION update_table_status_on_order()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.table_id IS NOT NULL AND NEW.status = 'pending') THEN
    UPDATE restaurant_tables SET status = 'occupied', current_order_id = NEW.id WHERE id = NEW.table_id;
  ELSIF (OLD.table_id IS NOT NULL AND (NEW.status = 'paid' OR NEW.status = 'cancelled')) THEN
    UPDATE restaurant_tables SET status = 'cleaning', current_order_id = NULL WHERE id = OLD.table_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_update_table_status
AFTER INSERT OR UPDATE OF status, table_id ON orders
FOR EACH ROW EXECUTE FUNCTION update_table_status_on_order();
