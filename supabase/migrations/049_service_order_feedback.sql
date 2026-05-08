-- ============================================================
-- 049 : Feedback client sur les ordres de service
-- ============================================================

ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS client_rating   SMALLINT CHECK (client_rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS client_feedback TEXT;

-- RPC sécurisée : écriture uniquement via token valide, une seule fois
CREATE OR REPLACE FUNCTION submit_service_order_feedback(
  p_token    text,
  p_rating   smallint,
  p_feedback text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_status   text;
BEGIN
  SELECT service_order_id INTO v_order_id
  FROM client_tracking_tokens
  WHERE token = p_token AND expires_at > now()
  LIMIT 1;

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Token invalide ou expiré';
  END IF;

  SELECT status INTO v_status FROM service_orders WHERE id = v_order_id;

  IF v_status NOT IN ('paye', 'termine') THEN
    RAISE EXCEPTION 'Feedback disponible uniquement pour les prestations terminées';
  END IF;

  -- Idempotent : ne jamais écraser un avis déjà soumis
  UPDATE service_orders
  SET
    client_rating   = p_rating,
    client_feedback = NULLIF(TRIM(p_feedback), '')
  WHERE id = v_order_id AND client_rating IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_service_order_feedback TO anon, authenticated;
