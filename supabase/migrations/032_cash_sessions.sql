-- ── Sessions de caisse ────────────────────────────────────────────────────────

CREATE TABLE public.cash_sessions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  opened_by       uuid        REFERENCES public.users(id),
  closed_by       uuid        REFERENCES public.users(id),
  opening_amount  numeric(12,2) NOT NULL DEFAULT 0,

  -- Snapshot calculé à la clôture
  total_sales     numeric(12,2),
  total_cash      numeric(12,2),
  total_card      numeric(12,2),
  total_mobile    numeric(12,2),
  total_orders    integer,
  total_refunds   numeric(12,2),
  expected_cash   numeric(12,2),   -- opening_amount + total_cash
  actual_cash     numeric(12,2),   -- montant compté par le caissier
  difference      numeric(12,2),   -- actual_cash - expected_cash

  status          text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  notes           text,
  opened_at       timestamptz NOT NULL DEFAULT now(),
  closed_at       timestamptz
);

-- Une seule session ouverte par établissement
CREATE UNIQUE INDEX cash_sessions_one_open
  ON public.cash_sessions (business_id)
  WHERE status = 'open';

CREATE INDEX idx_cash_sessions_business ON public.cash_sessions (business_id, opened_at DESC);

ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cs_member_all" ON public.cash_sessions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND business_id = cash_sessions.business_id
    )
  );

-- ── RPC : ouvrir une session ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.open_cash_session(
  p_business_id    uuid,
  p_opening_amount numeric DEFAULT 0
)
RETURNS public.cash_sessions
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_session public.cash_sessions;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.cash_sessions
    WHERE business_id = p_business_id AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Une session de caisse est déjà ouverte.';
  END IF;

  INSERT INTO public.cash_sessions (business_id, opened_by, opening_amount)
  VALUES (p_business_id, auth.uid(), p_opening_amount)
  RETURNING * INTO v_session;

  RETURN v_session;
END;
$$;

-- ── RPC : clôturer une session ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.close_cash_session(
  p_session_id  uuid,
  p_actual_cash numeric,
  p_notes       text DEFAULT NULL
)
RETURNS public.cash_sessions
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_session public.cash_sessions;
  v_sales   numeric(12,2);
  v_cash    numeric(12,2);
  v_card    numeric(12,2);
  v_mobile  numeric(12,2);
  v_orders  integer;
  v_refunds numeric(12,2);
BEGIN
  SELECT * INTO v_session
  FROM public.cash_sessions
  WHERE id = p_session_id AND status = 'open';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session introuvable ou déjà clôturée.';
  END IF;

  -- Totaux des ventes payées pendant la session
  SELECT
    COALESCE(SUM(o.total), 0),
    COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'cash'), 0),
    COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'card'), 0),
    COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'mobile_money'), 0),
    COUNT(DISTINCT o.id)
  INTO v_sales, v_cash, v_card, v_mobile, v_orders
  FROM public.orders o
  JOIN public.payments p ON p.order_id = o.id
  WHERE o.business_id = v_session.business_id
    AND o.status = 'paid'
    AND o.created_at >= v_session.opened_at;

  -- Remboursements pendant la session
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
    total_sales   = v_sales,
    total_cash    = v_cash,
    total_card    = v_card,
    total_mobile  = v_mobile,
    total_orders  = v_orders,
    total_refunds = v_refunds,
    expected_cash = v_session.opening_amount + v_cash,
    actual_cash   = p_actual_cash,
    difference    = p_actual_cash - (v_session.opening_amount + v_cash),
    notes         = p_notes
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  RETURN v_session;
END;
$$;

-- ── RPC : résumé en temps réel d'une session ouverte ─────────────────────────

CREATE OR REPLACE FUNCTION public.get_session_live_summary(p_session_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_session public.cash_sessions;
  v_result  json;
BEGIN
  SELECT * INTO v_session FROM public.cash_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session introuvable.'; END IF;

  SELECT json_build_object(
    'total_sales',  COALESCE(SUM(o.total), 0),
    'total_cash',   COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'cash'), 0),
    'total_card',   COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'card'), 0),
    'total_mobile', COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'mobile_money'), 0),
    'total_orders', COUNT(DISTINCT o.id),
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
