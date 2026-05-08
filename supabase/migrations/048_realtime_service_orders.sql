-- ============================================================
-- 048 : Activer Realtime sur service_orders et service_order_events
-- ============================================================

-- service_orders (filtre sur id = PK, DEFAULT replica identity suffit)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'service_orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE service_orders;
  END IF;
END $$;

-- service_order_events (filtre sur service_order_id = non-PK → FULL obligatoire)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'service_order_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE service_order_events;
  END IF;
END $$;

ALTER TABLE service_order_events REPLICA IDENTITY FULL;
