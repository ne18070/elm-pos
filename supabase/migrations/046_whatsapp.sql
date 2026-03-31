-- ============================================================
-- Migration 046 : WhatsApp Business Integration
-- ============================================================

-- Permettre les commandes sans caissier (commandes WhatsApp / externes)
ALTER TABLE orders ALTER COLUMN cashier_id DROP NOT NULL;

-- Source de la commande (pos, whatsapp, delivery, …)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'pos';

-- Config WhatsApp par établissement (un seul numéro par business)
CREATE TABLE IF NOT EXISTS whatsapp_configs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id     UUID NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  phone_number_id TEXT NOT NULL DEFAULT '',
  access_token    TEXT NOT NULL DEFAULT '',
  verify_token    TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  display_phone   TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT false,
  catalog_enabled BOOLEAN NOT NULL DEFAULT false,
  welcome_message TEXT NOT NULL DEFAULT 'Bienvenue chez {nom} ! Tapez *menu* pour voir notre catalogue 🛍️',
  menu_keyword    TEXT NOT NULL DEFAULT 'menu',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Messages WhatsApp entrants et sortants
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  wa_message_id TEXT,
  from_phone    TEXT NOT NULL,
  from_name     TEXT,
  direction     TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type  TEXT NOT NULL DEFAULT 'text',
  body          TEXT,
  payload       JSONB,
  order_id      UUID REFERENCES orders(id),
  status        TEXT NOT NULL DEFAULT 'received',
  replied_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT whatsapp_messages_wa_id_unique UNIQUE (wa_message_id)
);

-- Paniers actifs pour le flux catalogue interactif
CREATE TABLE IF NOT EXISTS whatsapp_carts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  from_phone  TEXT NOT NULL,
  step        TEXT NOT NULL DEFAULT 'menu',
  items       JSONB NOT NULL DEFAULT '[]',
  context     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(business_id, from_phone)
);

-- Index
CREATE INDEX IF NOT EXISTS whatsapp_messages_biz_date_idx ON whatsapp_messages(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_messages_phone_idx    ON whatsapp_messages(business_id, from_phone);
CREATE INDEX IF NOT EXISTS whatsapp_carts_phone_idx       ON whatsapp_carts(business_id, from_phone);

-- RLS
ALTER TABLE whatsapp_configs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_carts    ENABLE ROW LEVEL SECURITY;

-- whatsapp_configs
DROP POLICY IF EXISTS "wacfg: manager read"  ON whatsapp_configs;
DROP POLICY IF EXISTS "wacfg: admin write"   ON whatsapp_configs;
DROP POLICY IF EXISTS "wacfg: service_role"  ON whatsapp_configs;

CREATE POLICY "wacfg: manager read"
  ON whatsapp_configs FOR SELECT
  USING (business_id IN (
    SELECT business_id FROM business_members
    WHERE user_id = auth.uid() AND role IN ('owner','admin','manager')
  ));

CREATE POLICY "wacfg: admin write"
  ON whatsapp_configs FOR ALL
  USING (business_id IN (
    SELECT business_id FROM business_members
    WHERE user_id = auth.uid() AND role IN ('owner','admin')
  ));

CREATE POLICY "wacfg: service_role"
  ON whatsapp_configs FOR ALL USING (auth.role() = 'service_role');

-- whatsapp_messages
DROP POLICY IF EXISTS "wamsg: members read"   ON whatsapp_messages;
DROP POLICY IF EXISTS "wamsg: members insert" ON whatsapp_messages;
DROP POLICY IF EXISTS "wamsg: members update" ON whatsapp_messages;
DROP POLICY IF EXISTS "wamsg: service_role"   ON whatsapp_messages;

CREATE POLICY "wamsg: members read"
  ON whatsapp_messages FOR SELECT
  USING (business_id IN (
    SELECT business_id FROM business_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "wamsg: members insert"
  ON whatsapp_messages FOR INSERT
  WITH CHECK (business_id IN (
    SELECT business_id FROM business_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "wamsg: members update"
  ON whatsapp_messages FOR UPDATE
  USING (business_id IN (
    SELECT business_id FROM business_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "wamsg: service_role"
  ON whatsapp_messages FOR ALL USING (auth.role() = 'service_role');

-- whatsapp_carts
DROP POLICY IF EXISTS "wacart: service_role" ON whatsapp_carts;

CREATE POLICY "wacart: service_role"
  ON whatsapp_carts FOR ALL USING (auth.role() = 'service_role');

-- Trigger updated_at sur whatsapp_configs
CREATE OR REPLACE FUNCTION update_whatsapp_config_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS whatsapp_configs_updated_at ON whatsapp_configs;
CREATE TRIGGER whatsapp_configs_updated_at
  BEFORE UPDATE ON whatsapp_configs
  FOR EACH ROW EXECUTE FUNCTION update_whatsapp_config_updated_at();
