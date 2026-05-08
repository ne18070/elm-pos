-- ============================================================
-- 047 : Timeline événementielle pour les ordres de service
-- Chaque changement de statut est auto-loggé via trigger Postgres.
-- ============================================================

CREATE TABLE IF NOT EXISTS service_order_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id UUID NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  business_id      UUID NOT NULL REFERENCES businesses(id)     ON DELETE CASCADE,
  event_type       TEXT NOT NULL DEFAULT 'status_change',
  -- 'created' | 'status_change'
  label            TEXT NOT NULL,
  actor_name       TEXT,
  metadata         JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_soe_order    ON service_order_events(service_order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_soe_business ON service_order_events(business_id);

ALTER TABLE service_order_events ENABLE ROW LEVEL SECURITY;

-- Membres authentifiés de l'entreprise
CREATE POLICY "soe_member" ON service_order_events
  FOR ALL TO authenticated
  USING  (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

-- Lecture publique via token de suivi valide
CREATE POLICY "soe_public_via_token" ON service_order_events
  FOR SELECT TO anon, authenticated
  USING (
    service_order_id IN (
      SELECT service_order_id
      FROM   client_tracking_tokens
      WHERE  expires_at > now()
    )
  );

-- ── Trigger auto-log ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION log_service_order_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO service_order_events(service_order_id, business_id, event_type, label)
    VALUES (NEW.id, NEW.business_id, 'created', 'Ordre de travail créé');

  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO service_order_events(service_order_id, business_id, event_type, label)
    VALUES (
      NEW.id,
      NEW.business_id,
      'status_change',
      CASE NEW.status
        WHEN 'en_cours' THEN 'Prise en charge'
        WHEN 'termine'  THEN 'Travaux terminés'
        WHEN 'paye'     THEN 'Paiement reçu'
        WHEN 'annule'   THEN 'Annulé'
        ELSE NEW.status
      END
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_service_order_events ON service_orders;
CREATE TRIGGER trg_service_order_events
  AFTER INSERT OR UPDATE ON service_orders
  FOR EACH ROW EXECUTE FUNCTION log_service_order_event();
