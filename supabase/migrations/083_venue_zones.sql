-- ============================================================
-- Migration 083 : Module Restaurant → flexible pour hôtels
--
-- 1. daily_menus : menu par zone (zone_id nullable FK → restaurant_floors)
-- 2. order_channel : ajouter 'room_service' (room service hôtel)
-- ============================================================

-- ─── 1. Menu par zone ─────────────────────────────────────────────────────────
-- zone_id nullable : NULL = menu global, UUID = menu propre à une zone
ALTER TABLE daily_menus
  ADD COLUMN IF NOT EXISTS zone_id UUID REFERENCES restaurant_floors(id) ON DELETE SET NULL;

-- Supprimer l'ancien UNIQUE (business_id, date)
ALTER TABLE daily_menus
  DROP CONSTRAINT IF EXISTS daily_menus_business_id_date_key;

-- Menu global (zone_id IS NULL) : un seul par business/date
CREATE UNIQUE INDEX IF NOT EXISTS daily_menus_global_uniq
  ON daily_menus (business_id, date)
  WHERE zone_id IS NULL;

-- Menu par zone : un seul par business/date/zone
CREATE UNIQUE INDEX IF NOT EXISTS daily_menus_zone_uniq
  ON daily_menus (business_id, date, zone_id)
  WHERE zone_id IS NOT NULL;

-- ─── 2. order_channel : ajouter room_service ──────────────────────────────────
-- Le CHECK constraint actuel autorise seulement 'salle', 'emporter', 'livraison'.
-- On l'étend pour inclure 'room_service' (commandes room service hôtel).
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_order_channel_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_order_channel_check
  CHECK (order_channel IN ('salle', 'emporter', 'livraison', 'room_service'));

-- Index partiel pour room_service (même logique que emporter/livraison)
CREATE INDEX IF NOT EXISTS orders_room_service_idx
  ON orders (business_id, created_at DESC)
  WHERE order_channel = 'room_service';
