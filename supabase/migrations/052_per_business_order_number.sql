-- ============================================================
-- 052 : Numérotation des OT par business (et non globale)
-- Problème : order_number SERIAL = séquence unique partagée
-- Fix : table de compteurs + trigger BEFORE INSERT
-- ============================================================

-- 1. Supprimer le DEFAULT SERIAL (garde la colonne INT, supprime la séquence auto)
ALTER TABLE service_orders ALTER COLUMN order_number DROP DEFAULT;

-- 2. Table de compteurs par business
CREATE TABLE IF NOT EXISTS service_order_counters (
  business_id UUID PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  last_number INT NOT NULL DEFAULT 0
);

-- 3. Initialiser depuis les données existantes
INSERT INTO service_order_counters (business_id, last_number)
SELECT business_id, COALESCE(MAX(order_number), 0)
FROM service_orders
GROUP BY business_id
ON CONFLICT (business_id) DO UPDATE
  SET last_number = GREATEST(service_order_counters.last_number, EXCLUDED.last_number);

-- 4. Fonction trigger (SECURITY DEFINER pour bypasser la RLS sur service_order_counters)
CREATE OR REPLACE FUNCTION assign_service_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next INT;
BEGIN
  INSERT INTO service_order_counters (business_id, last_number)
  VALUES (NEW.business_id, 1)
  ON CONFLICT (business_id) DO UPDATE
    SET last_number = service_order_counters.last_number + 1
  RETURNING last_number INTO v_next;

  NEW.order_number := v_next;
  RETURN NEW;
END;
$$;

-- 5. Trigger BEFORE INSERT
DROP TRIGGER IF EXISTS trg_assign_service_order_number ON service_orders;
CREATE TRIGGER trg_assign_service_order_number
  BEFORE INSERT ON service_orders
  FOR EACH ROW
  EXECUTE FUNCTION assign_service_order_number();

-- 6. RLS sur la table de compteurs (lecture seule pour les membres)
ALTER TABLE service_order_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "counter_member" ON service_order_counters;
CREATE POLICY "counter_member" ON service_order_counters
  FOR SELECT TO authenticated
  USING (business_id IN (
    SELECT business_id FROM business_members WHERE user_id = auth.uid()
  ));
