-- ─── Hotel room availability constraint ──────────────────────────────────────
--
-- Prevents overlapping reservations for the same room.
-- Active statuses that block availability: confirmed, checked_in
-- Ignored statuses: cancelled, checked_out, no_show
--
-- Overlap rule (exclusive end): new_check_in < existing.check_out
--                            AND existing.check_in < new_check_out

CREATE OR REPLACE FUNCTION check_hotel_room_availability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  conflict_count INT;
BEGIN
  -- Only check active reservations
  IF NEW.status NOT IN ('confirmed', 'checked_in') THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO conflict_count
  FROM hotel_reservations
  WHERE room_id   = NEW.room_id
    AND id       != NEW.id                          -- exclude self (for updates)
    AND status   IN ('confirmed', 'checked_in')
    AND check_in  < NEW.check_out                   -- existing starts before new ends
    AND check_out > NEW.check_in;                   -- existing ends after new starts

  IF conflict_count > 0 THEN
    RAISE EXCEPTION 'ROOM_UNAVAILABLE: Cette chambre est déjà réservée sur cette période.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hotel_room_availability ON hotel_reservations;
CREATE TRIGGER trg_hotel_room_availability
  BEFORE INSERT OR UPDATE ON hotel_reservations
  FOR EACH ROW EXECUTE FUNCTION check_hotel_room_availability();

-- Helper RPC: returns conflicting reservations for a room + date range
-- Used client-side to show availability before attempting to save.
CREATE OR REPLACE FUNCTION get_room_conflicts(
  p_room_id    UUID,
  p_check_in   DATE,
  p_check_out  DATE,
  p_exclude_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id          UUID,
  check_in    DATE,
  check_out   DATE,
  status      TEXT,
  guest_name  TEXT
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    r.id, r.check_in, r.check_out, r.status,
    g.full_name
  FROM hotel_reservations r
  LEFT JOIN hotel_guests g ON g.id = r.guest_id
  WHERE r.room_id   = p_room_id
    AND r.id       != COALESCE(p_exclude_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND r.status   IN ('confirmed', 'checked_in')
    AND r.check_in  < p_check_out
    AND r.check_out > p_check_in;
$$;

GRANT EXECUTE ON FUNCTION get_room_conflicts(UUID, DATE, DATE, UUID) TO authenticated;
