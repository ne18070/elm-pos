-- Hotel housekeeping: cleaning logs, assigned cleaner per room

ALTER TABLE hotel_rooms
  ADD COLUMN IF NOT EXISTS assigned_cleaner_id UUID REFERENCES staff(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS hotel_cleaning_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  room_id         UUID NOT NULL REFERENCES hotel_rooms(id) ON DELETE CASCADE,
  reservation_id  UUID REFERENCES hotel_reservations(id) ON DELETE SET NULL,
  cleaner_id      UUID REFERENCES staff(id) ON DELETE SET NULL,
  action          TEXT NOT NULL CHECK (action IN ('cleaned', 'maintenance_start', 'maintenance_end', 'assigned')),
  notes           TEXT,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hcl_room     ON hotel_cleaning_logs(room_id);
CREATE INDEX IF NOT EXISTS idx_hcl_business ON hotel_cleaning_logs(business_id);
CREATE INDEX IF NOT EXISTS idx_hcl_created  ON hotel_cleaning_logs(created_at DESC);

ALTER TABLE hotel_cleaning_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hcl_member_all" ON hotel_cleaning_logs;
CREATE POLICY "hcl_member_all" ON hotel_cleaning_logs
  FOR ALL TO authenticated
  USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));
