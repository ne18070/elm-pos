-- Migration 033 : Fix math for expected_cash and difference in cash sessions
-- Expected cash should subtract refunds from the total cash inflows.

-- 1. get_session_live_summary ─────────────────────────────────────────────────
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
  v_s_cash       numeric(12,2) := 0;
  v_s_card       numeric(12,2) := 0;
  v_s_mobile     numeric(12,2) := 0;
  v_s_total      numeric(12,2) := 0;
  v_refunds      numeric(12,2) := 0;
BEGIN
  SELECT * INTO v_session FROM public.cash_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session introuvable.'; END IF;

  -- Paiements hôtel
  SELECT
    COALESCE(SUM(amount) FILTER (WHERE method = 'cash'),         0),
    COALESCE(SUM(amount) FILTER (WHERE method = 'card'),         0),
    COALESCE(SUM(amount) FILTER (WHERE method = 'mobile_money'), 0),
    COALESCE(SUM(amount), 0)
  INTO v_h_cash, v_h_card, v_h_mobile, v_h_total
  FROM public.hotel_payments
  WHERE session_id = p_session_id;

  -- Paiements OT (service orders)
  SELECT
    COALESCE(SUM(paid_amount) FILTER (WHERE payment_method = 'cash'),         0),
    COALESCE(SUM(paid_amount) FILTER (WHERE payment_method = 'card'),         0),
    COALESCE(SUM(paid_amount) FILTER (WHERE payment_method = 'mobile_money'), 0),
    COALESCE(SUM(paid_amount), 0)
  INTO v_s_cash, v_s_card, v_s_mobile, v_s_total
  FROM public.service_orders
  WHERE business_id = v_session.business_id
    AND status      = 'paye'
    AND paid_at    >= v_session.opened_at;

  -- Remboursements (boutique uniquement pour l'instant)
  SELECT COALESCE(SUM(r.amount), 0)
  INTO v_refunds
  FROM public.refunds r
  JOIN public.orders ord ON ord.id = r.order_id
  WHERE ord.business_id = v_session.business_id
    AND r.refunded_at  >= v_session.opened_at;

  SELECT json_build_object(
    'total_sales',   COALESCE(SUM(o.total), 0) + v_h_total + v_s_total,
    'total_cash',    COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'cash'),         0) + v_h_cash   + v_s_cash,
    'total_card',    COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'card'),         0) + v_h_card   + v_s_card,
    'total_mobile',  COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'mobile_money'), 0) + v_h_mobile + v_s_mobile,
    'total_orders',  COUNT(DISTINCT o.id),
    'total_refunds', v_refunds
  )
  INTO v_result
  FROM public.orders o
  JOIN public.payments p ON p.order_id = o.id
  WHERE o.business_id = v_session.business_id
    AND o.status      = 'paid'
    AND o.created_at >= v_session.opened_at;

  RETURN v_result;
END;
$$;


-- 2. close_cash_session ───────────────────────────────────────────────────────
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
  v_s_cash   numeric(12,2) := 0;
  v_s_card   numeric(12,2) := 0;
  v_s_mobile numeric(12,2) := 0;
  v_s_total  numeric(12,2) := 0;
  v_expected numeric(12,2);
BEGIN
  SELECT * INTO v_session
  FROM public.cash_sessions
  WHERE id = p_session_id AND status = 'open';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session introuvable ou déjà clôturée.';
  END IF;

  -- Ventes boutique / caisse
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
    AND o.status      = 'paid'
    AND o.created_at >= v_session.opened_at;

  -- Paiements hôtel
  SELECT
    COALESCE(SUM(amount) FILTER (WHERE method = 'cash'),         0),
    COALESCE(SUM(amount) FILTER (WHERE method = 'card'),         0),
    COALESCE(SUM(amount) FILTER (WHERE method = 'mobile_money'), 0),
    COALESCE(SUM(amount), 0)
  INTO v_h_cash, v_h_card, v_h_mobile, v_h_total
  FROM public.hotel_payments
  WHERE session_id = p_session_id;

  -- Paiements OT (service orders)
  SELECT
    COALESCE(SUM(paid_amount) FILTER (WHERE payment_method = 'cash'),         0),
    COALESCE(SUM(paid_amount) FILTER (WHERE payment_method = 'card'),         0),
    COALESCE(SUM(paid_amount) FILTER (WHERE payment_method = 'mobile_money'), 0),
    COALESCE(SUM(paid_amount), 0)
  INTO v_s_cash, v_s_card, v_s_mobile, v_s_total
  FROM public.service_orders
  WHERE business_id = v_session.business_id
    AND status      = 'paye'
    AND paid_at    >= v_session.opened_at;

  -- Remboursements (boutique uniquement pour l'instant)
  SELECT COALESCE(SUM(r.amount), 0)
  INTO v_refunds
  FROM public.refunds r
  JOIN public.orders o ON o.id = r.order_id
  WHERE o.business_id  = v_session.business_id
    AND r.refunded_at >= v_session.opened_at;

  v_expected := v_session.opening_amount + v_cash + v_h_cash + v_s_cash - v_refunds;

  UPDATE public.cash_sessions SET
    status        = 'closed',
    closed_by     = auth.uid(),
    closed_at     = now(),
    total_sales   = v_sales  + v_h_total  + v_s_total,
    total_cash    = v_cash   + v_h_cash   + v_s_cash,
    total_card    = v_card   + v_h_card   + v_s_card,
    total_mobile  = v_mobile + v_h_mobile + v_s_mobile,
    total_orders  = v_orders,
    total_refunds = v_refunds,
    expected_cash = v_expected,
    actual_cash   = p_actual_cash,
    difference    = p_actual_cash - v_expected,
    notes         = p_notes
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  RETURN v_session;
END;
$$;
