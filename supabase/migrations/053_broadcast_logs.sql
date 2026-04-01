-- Historique des envois broadcast WhatsApp pour éviter les doublons
CREATE TABLE IF NOT EXISTS whatsapp_broadcast_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  phone       TEXT NOT NULL,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, date, phone)
);

ALTER TABLE whatsapp_broadcast_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "broadcast_logs: members" ON whatsapp_broadcast_logs;
CREATE POLICY "broadcast_logs: members"
  ON whatsapp_broadcast_logs FOR ALL
  USING (business_id IN (
    SELECT business_id FROM business_members WHERE user_id = auth.uid()
  ));
