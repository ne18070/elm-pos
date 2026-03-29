-- ─── Hotel improvements ───────────────────────────────────────────────────────

-- 1. Table hotel_payments : paiements partiels / acomptes liés aux réservations
CREATE TABLE IF NOT EXISTS public.hotel_payments (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    uuid          NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  reservation_id uuid          NOT NULL REFERENCES public.hotel_reservations(id) ON DELETE CASCADE,
  session_id     uuid          REFERENCES public.cash_sessions(id),
  amount         numeric(12,2) NOT NULL CHECK (amount > 0),
  method         text          NOT NULL DEFAULT 'cash'
                   CHECK (method IN ('cash', 'card', 'mobile_money')),
  note           text,
  paid_at        timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE public.hotel_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hp_member_all" ON public.hotel_payments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND business_id = hotel_payments.business_id
    )
  );

CREATE INDEX IF NOT EXISTS idx_hotel_payments_reservation ON public.hotel_payments (reservation_id);
CREATE INDEX IF NOT EXISTS idx_hotel_payments_session     ON public.hotel_payments (session_id);

-- 2. Storage bucket pour les logos d'établissements
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('business-logos', 'business-logos', true, 2097152, ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "logo_read_all"      ON storage.objects FOR SELECT USING (bucket_id = 'business-logos');
CREATE POLICY "logo_upload_member" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'business-logos' AND auth.role() = 'authenticated');
CREATE POLICY "logo_update_member" ON storage.objects FOR UPDATE
  USING  (bucket_id = 'business-logos' AND auth.role() = 'authenticated');
CREATE POLICY "logo_delete_member" ON storage.objects FOR DELETE
  USING  (bucket_id = 'business-logos' AND auth.role() = 'authenticated');

-- 3. get_session_live_summary inclut les paiements hôtel
CREATE OR REPLACE FUNCTION public.get_session_live_summary(p_session_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_session      public.cash_sessions;
  v_result       json;
  v_h_cash       numeric(12,2) := 0;
  v_h_card       numeric(12,2) := 0;
  v_h_mobile     numeric(12,2) := 0;
  v_h_total      numeric(12,2) := 0;
BEGIN
  SELECT * INTO v_session FROM public.cash_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session introuvable.'; END IF;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE method = 'cash'),         0),
    COALESCE(SUM(amount) FILTER (WHERE method = 'card'),         0),
    COALESCE(SUM(amount) FILTER (WHERE method = 'mobile_money'), 0),
    COALESCE(SUM(amount), 0)
  INTO v_h_cash, v_h_card, v_h_mobile, v_h_total
  FROM public.hotel_payments
  WHERE session_id = p_session_id;

  SELECT json_build_object(
    'total_sales',   COALESCE(SUM(o.total), 0) + v_h_total,
    'total_cash',    COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'cash'),         0) + v_h_cash,
    'total_card',    COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'card'),         0) + v_h_card,
    'total_mobile',  COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'mobile_money'), 0) + v_h_mobile,
    'total_orders',  COUNT(DISTINCT o.id),
    'total_refunds', COALESCE((
      SELECT SUM(r.amount)
      FROM public.refunds r
      JOIN public.orders ord ON ord.id = r.order_id
      WHERE ord.business_id = v_session.business_id
        AND r.refunded_at >= v_session.opened_at
    ), 0)
  )
  INTO v_result
  FROM public.orders o
  JOIN public.payments p ON p.order_id = o.id
  WHERE o.business_id = v_session.business_id
    AND o.status = 'paid'
    AND o.created_at >= v_session.opened_at;

  RETURN v_result;
END;
$$;

-- 4. close_cash_session inclut les paiements hôtel
CREATE OR REPLACE FUNCTION public.close_cash_session(
  p_session_id  uuid,
  p_actual_cash numeric,
  p_notes       text DEFAULT NULL
)
RETURNS public.cash_sessions
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_session  public.cash_sessions;
  v_sales    numeric(12,2);
  v_cash     numeric(12,2);
  v_card     numeric(12,2);
  v_mobile   numeric(12,2);
  v_orders   integer;
  v_refunds  numeric(12,2);
  v_h_cash   numeric(12,2) := 0;
  v_h_card   numeric(12,2) := 0;
  v_h_mobile numeric(12,2) := 0;
  v_h_total  numeric(12,2) := 0;
BEGIN
  SELECT * INTO v_session
  FROM public.cash_sessions
  WHERE id = p_session_id AND status = 'open';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session introuvable ou déjà clôturée.';
  END IF;

  SELECT
    COALESCE(SUM(o.total), 0),
    COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'cash'),         0),
    COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'card'),         0),
    COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'mobile_money'), 0),
    COUNT(DISTINCT o.id)
  INTO v_sales, v_cash, v_card, v_mobile, v_orders
  FROM public.orders o
  JOIN public.payments p ON p.order_id = o.id
  WHERE o.business_id = v_session.business_id
    AND o.status = 'paid'
    AND o.created_at >= v_session.opened_at;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE method = 'cash'),         0),
    COALESCE(SUM(amount) FILTER (WHERE method = 'card'),         0),
    COALESCE(SUM(amount) FILTER (WHERE method = 'mobile_money'), 0),
    COALESCE(SUM(amount), 0)
  INTO v_h_cash, v_h_card, v_h_mobile, v_h_total
  FROM public.hotel_payments
  WHERE session_id = p_session_id;

  SELECT COALESCE(SUM(r.amount), 0)
  INTO v_refunds
  FROM public.refunds r
  JOIN public.orders o ON o.id = r.order_id
  WHERE o.business_id = v_session.business_id
    AND r.refunded_at >= v_session.opened_at;

  UPDATE public.cash_sessions SET
    status        = 'closed',
    closed_by     = auth.uid(),
    closed_at     = now(),
    total_sales   = v_sales + v_h_total,
    total_cash    = v_cash  + v_h_cash,
    total_card    = v_card  + v_h_card,
    total_mobile  = v_mobile + v_h_mobile,
    total_orders  = v_orders,
    total_refunds = v_refunds,
    expected_cash = v_session.opening_amount + v_cash + v_h_cash,
    actual_cash   = p_actual_cash,
    difference    = p_actual_cash - (v_session.opening_amount + v_cash + v_h_cash),
    notes         = p_notes
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  RETURN v_session;
END;
$$;
