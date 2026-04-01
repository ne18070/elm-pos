-- Shipping options configuration on whatsapp_configs
ALTER TABLE whatsapp_configs
  ADD COLUMN IF NOT EXISTS enable_pickup    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_delivery  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_fee     INTEGER NOT NULL DEFAULT 0;

-- Delivery info on orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_type     TEXT,      -- 'pickup' | 'delivery'
  ADD COLUMN IF NOT EXISTS delivery_address  TEXT,
  ADD COLUMN IF NOT EXISTS delivery_location JSONB;     -- { latitude, longitude, name?, address? }
