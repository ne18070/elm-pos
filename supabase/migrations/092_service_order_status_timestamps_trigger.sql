-- Replace client-side new Date() with server-side NOW() for service order timestamps.
-- The client clock can be wrong (wrong system time, timezone misconfiguration, etc.).
-- PostgreSQL's NOW() is always correct UTC.

CREATE OR REPLACE FUNCTION set_service_order_status_timestamps()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Only act when status actually changes
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'en_cours' AND OLD.started_at IS NULL THEN
    NEW.started_at := NOW();
  END IF;

  IF NEW.status = 'termine' THEN
    NEW.finished_at := NOW();
    -- Auto-start if jumped directly from attente/pause to termine
    IF NEW.started_at IS NULL THEN
      NEW.started_at := NOW();
    END IF;
  END IF;

  IF NEW.status = 'paye' AND NEW.paid_at IS NULL THEN
    NEW.paid_at := NOW();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_service_order_status_timestamps ON public.service_orders;
CREATE TRIGGER trg_service_order_status_timestamps
  BEFORE UPDATE OF status ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION set_service_order_status_timestamps();

GRANT EXECUTE ON FUNCTION set_service_order_status_timestamps() TO authenticated, service_role;
