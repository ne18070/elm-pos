-- ============================================================
-- ELM APP — Améliorations module hôtel
-- Migration 054
-- ============================================================

-- Item 8 : Tarification weekend par chambre
ALTER TABLE hotel_rooms
  ADD COLUMN IF NOT EXISTS weekend_price_per_night NUMERIC DEFAULT NULL;

-- Item 11 : Groupement de réservations multi-chambres
ALTER TABLE hotel_reservations
  ADD COLUMN IF NOT EXISTS group_id UUID DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_hotel_res_group ON hotel_reservations(group_id)
  WHERE group_id IS NOT NULL;

-- Commentaires
COMMENT ON COLUMN hotel_rooms.weekend_price_per_night IS 'Prix vendredi/samedi nuit — null = même tarif que la semaine';
COMMENT ON COLUMN hotel_reservations.group_id         IS 'Identifiant de groupe pour réservations multi-chambres liées';
