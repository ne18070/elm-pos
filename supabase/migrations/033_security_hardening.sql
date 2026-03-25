-- ═══════════════════════════════════════════════════════════════════════════════
-- 033 - Security hardening
-- ● Fix RLS policies (multi-tenant isolation)
-- ● Rate limiting on sensitive RPCs
-- ● Server-side input validation in RPCs
-- ● Immutable activity_logs (deny UPDATE / DELETE)
-- ● last_seen_at tracking for session inactivity
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Fix activity_logs INSERT policy ──────────────────────────────────────
-- Old policy had WITH CHECK (true) → any authenticated user could log for any business.
-- New policy restricts inserts to the user's own businesses.

DROP POLICY IF EXISTS "activity_logs_insert" ON public.activity_logs;
CREATE POLICY "activity_logs_insert" ON public.activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    business_id IN (
      SELECT business_id FROM public.business_members WHERE user_id = auth.uid()
    )
  );

-- Make activity_logs explicitly immutable: deny UPDATE and DELETE for everyone.
DROP POLICY IF EXISTS "activity_logs_no_update" ON public.activity_logs;
CREATE POLICY "activity_logs_no_update" ON public.activity_logs
  FOR UPDATE TO authenticated
  USING (false);

DROP POLICY IF EXISTS "activity_logs_no_delete" ON public.activity_logs;
CREATE POLICY "activity_logs_no_delete" ON public.activity_logs
  FOR DELETE TO authenticated
  USING (false);

-- ─── 2. Fix users UPDATE self policy (prevent privilege escalation) ───────────
-- Old policy had no field restrictions → user could elevate their own role.

DROP POLICY IF EXISTS "users_update_self" ON public.users;
CREATE POLICY "users_update_self" ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    -- Prevent changing privileged fields by ensuring they don't change
    AND role      = (SELECT role      FROM public.users WHERE id = auth.uid())
    AND is_superadmin = (SELECT is_superadmin FROM public.users WHERE id = auth.uid())
    AND is_blocked    = (SELECT is_blocked    FROM public.users WHERE id = auth.uid())
  );

-- ─── 3. Rate limiting infrastructure ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key        text        NOT NULL,
  count      int         NOT NULL DEFAULT 1,
  window_end timestamptz NOT NULL,
  PRIMARY KEY (key)
);

-- Only the service role (SECURITY DEFINER functions) can touch rate_limits.
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rate_limits_deny_direct" ON public.rate_limits
  FOR ALL TO authenticated
  USING (false);

-- Helper function: returns TRUE if the action is allowed, FALSE if rate-limited.
-- window_seconds: duration of the rolling window
-- max_count: maximum calls allowed within that window
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key            text,
  p_max_count      int,
  p_window_seconds int DEFAULT 60
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  INSERT INTO public.rate_limits (key, count, window_end)
  VALUES (p_key, 1, v_now + (p_window_seconds || ' seconds')::interval)
  ON CONFLICT (key) DO UPDATE
    SET count      = CASE
                       WHEN rate_limits.window_end < v_now
                       THEN 1
                       ELSE rate_limits.count + 1
                     END,
        window_end = CASE
                       WHEN rate_limits.window_end < v_now
                       THEN v_now + (p_window_seconds || ' seconds')::interval
                       ELSE rate_limits.window_end
                     END;

  RETURN (SELECT count <= p_max_count FROM public.rate_limits WHERE key = p_key);
END;
$$;

-- ─── 4. Harden activate_subscription (rate limit + input validation) ──────────

CREATE OR REPLACE FUNCTION activate_subscription(
  p_business_id uuid,
  p_plan_id     uuid,
  p_days        int    DEFAULT 30,
  p_note        text   DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Superadmin check
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  -- Rate limit: 20 activations per 60s per superadmin (prevents bulk abuse)
  IF NOT check_rate_limit('activate_sub:' || auth.uid()::text, 20, 60) THEN
    RAISE EXCEPTION 'Trop de requêtes — réessayez dans quelques secondes';
  END IF;

  -- Input validation
  IF p_days < 1 OR p_days > 3650 THEN
    RAISE EXCEPTION 'Durée invalide : entre 1 et 3650 jours';
  END IF;
  IF p_plan_id IS NULL THEN
    RAISE EXCEPTION 'plan_id requis';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.businesses WHERE id = p_business_id) THEN
    RAISE EXCEPTION 'Établissement introuvable';
  END IF;

  INSERT INTO subscriptions (business_id, plan_id, status, expires_at, activated_at, payment_note)
  VALUES (p_business_id, p_plan_id, 'active', now() + (p_days || ' days')::interval, now(), p_note)
  ON CONFLICT (business_id) DO UPDATE SET
    plan_id      = p_plan_id,
    status       = 'active',
    expires_at   = now() + (p_days || ' days')::interval,
    activated_at = now(),
    payment_note = COALESCE(p_note, subscriptions.payment_note);
END;
$$;

-- ─── 5. Harden admin_reset_user_password (rate limit + password validation) ───

CREATE OR REPLACE FUNCTION admin_reset_user_password(
  p_user_id    uuid,
  p_new_password text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller_role text;
  v_target_business_id uuid;
BEGIN
  -- Get caller's role
  SELECT role INTO v_caller_role FROM public.users WHERE id = auth.uid();

  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  -- Rate limit: 5 password resets per 10 min per caller
  IF NOT check_rate_limit('pwd_reset:' || auth.uid()::text, 5, 600) THEN
    RAISE EXCEPTION 'Trop de tentatives — réessayez dans 10 minutes';
  END IF;

  -- Password validation: min 8 chars
  IF length(p_new_password) < 8 THEN
    RAISE EXCEPTION 'Le mot de passe doit contenir au moins 8 caractères';
  END IF;

  -- Ensure target user belongs to one of the caller's businesses
  SELECT bm_target.business_id INTO v_target_business_id
  FROM public.business_members bm_caller
  JOIN public.business_members bm_target ON bm_target.business_id = bm_caller.business_id
  WHERE bm_caller.user_id = auth.uid()
    AND bm_target.user_id = p_user_id
  LIMIT 1;

  IF v_target_business_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur introuvable ou hors de votre établissement';
  END IF;

  -- Prevent resetting a superadmin's password
  IF EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id AND is_superadmin = true) THEN
    RAISE EXCEPTION 'Impossible de réinitialiser le mot de passe d''un super-administrateur';
  END IF;

  -- Perform the reset via Supabase auth admin API (service role only)
  PERFORM extensions.http_post(
    'http://localhost:9999/admin/users/' || p_user_id::text,
    '{"password":"' || replace(p_new_password, '"', '\"') || '"}',
    'application/json'
  );
END;
$$;

-- Note: If extensions.http is not available, the password reset should be done
-- client-side via supabase.auth.admin.updateUserById() in a server action.
-- The RLS / rate-limit guard above still applies regardless.

-- ─── 6. Harden open_cash_session (rate limit + validation) ───────────────────

CREATE OR REPLACE FUNCTION open_cash_session(
  p_business_id    uuid,
  p_opening_amount numeric DEFAULT 0
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_session_id uuid;
BEGIN
  -- Caller must belong to this business
  IF NOT EXISTS (
    SELECT 1 FROM public.business_members
    WHERE user_id = auth.uid() AND business_id = p_business_id
  ) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  -- Rate limit: 10 opens per 60s per business (prevents loop abuse)
  IF NOT check_rate_limit('cash_open:' || p_business_id::text, 10, 60) THEN
    RAISE EXCEPTION 'Trop de requêtes';
  END IF;

  -- Input validation
  IF p_opening_amount < 0 THEN
    RAISE EXCEPTION 'Le fond de caisse ne peut pas être négatif';
  END IF;
  IF p_opening_amount > 10000000 THEN
    RAISE EXCEPTION 'Montant d''ouverture trop élevé';
  END IF;

  INSERT INTO public.cash_sessions (business_id, opened_by, opening_amount, status)
  VALUES (p_business_id, auth.uid(), p_opening_amount, 'open')
  RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$$;
GRANT EXECUTE ON FUNCTION open_cash_session(uuid, numeric) TO authenticated;

-- ─── 7. Harden close_cash_session (rate limit + validation) ──────────────────

CREATE OR REPLACE FUNCTION close_cash_session(
  p_session_id  uuid,
  p_actual_cash numeric DEFAULT 0,
  p_notes       text    DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_business_id uuid;
  v_total_sales  numeric;
  v_total_cash   numeric;
  v_total_card   numeric;
  v_total_mobile numeric;
  v_total_orders integer;
  v_total_refunds numeric;
  v_expected_cash numeric;
BEGIN
  -- Verify session belongs to caller's business
  SELECT business_id INTO v_business_id
  FROM public.cash_sessions
  WHERE id = p_session_id AND status = 'open';

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Session introuvable ou déjà clôturée';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.business_members
    WHERE user_id = auth.uid() AND business_id = v_business_id
  ) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  -- Rate limit: 10 closes per 60s per session
  IF NOT check_rate_limit('cash_close:' || p_session_id::text, 10, 60) THEN
    RAISE EXCEPTION 'Trop de requêtes';
  END IF;

  -- Input validation
  IF p_actual_cash < 0 THEN
    RAISE EXCEPTION 'Le montant ne peut pas être négatif';
  END IF;

  -- Compute snapshot from orders & payments during session window
  SELECT
    COALESCE(SUM(o.total), 0),
    COALESCE(SUM(CASE WHEN p.method = 'cash'   THEN p.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN p.method = 'card'   THEN p.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN p.method = 'mobile' THEN p.amount ELSE 0 END), 0),
    COUNT(DISTINCT o.id)
  INTO v_total_sales, v_total_cash, v_total_card, v_total_mobile, v_total_orders
  FROM public.orders o
  LEFT JOIN public.payments p ON p.order_id = o.id
  JOIN public.cash_sessions cs ON cs.id = p_session_id
  WHERE o.business_id = v_business_id
    AND o.created_at >= cs.opened_at
    AND o.status NOT IN ('cancelled');

  SELECT COALESCE(SUM(r.amount), 0)
  INTO v_total_refunds
  FROM public.refunds r
  JOIN public.cash_sessions cs ON cs.id = p_session_id
  WHERE r.business_id = v_business_id
    AND r.created_at >= cs.opened_at;

  v_expected_cash := (SELECT opening_amount FROM public.cash_sessions WHERE id = p_session_id)
                     + v_total_cash - COALESCE(v_total_refunds, 0);

  UPDATE public.cash_sessions SET
    status          = 'closed',
    closed_by       = auth.uid(),
    closed_at       = now(),
    total_sales     = v_total_sales,
    total_cash      = v_total_cash,
    total_card      = v_total_card,
    total_mobile    = v_total_mobile,
    total_orders    = v_total_orders,
    total_refunds   = v_total_refunds,
    expected_cash   = v_expected_cash,
    actual_cash     = p_actual_cash,
    difference      = p_actual_cash - v_expected_cash,
    notes           = p_notes
  WHERE id = p_session_id;
END;
$$;
GRANT EXECUTE ON FUNCTION close_cash_session(uuid, numeric, text) TO authenticated;

-- ─── 8. last_seen_at tracking ─────────────────────────────────────────────────

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

CREATE OR REPLACE FUNCTION update_last_seen()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.users SET last_seen_at = now() WHERE id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION update_last_seen() TO authenticated;

-- ─── 9. Validate orders amount at insert (server-side) ───────────────────────

CREATE OR REPLACE FUNCTION validate_order_amounts()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.total < 0 THEN
    RAISE EXCEPTION 'Le total d''une commande ne peut pas être négatif';
  END IF;
  IF NEW.subtotal IS NOT NULL AND NEW.subtotal < 0 THEN
    RAISE EXCEPTION 'Le sous-total ne peut pas être négatif';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_validate_amounts ON public.orders;
CREATE TRIGGER orders_validate_amounts
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION validate_order_amounts();

-- ─── 10. Validate payments amount at insert ───────────────────────────────────

CREATE OR REPLACE FUNCTION validate_payment_amounts()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Le montant d''un paiement doit être supérieur à 0';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_validate_amounts ON public.payments;
CREATE TRIGGER payments_validate_amounts
  BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION validate_payment_amounts();

-- ─── 11. Indexes for rate_limits cleanup (optional background purge) ──────────

CREATE INDEX IF NOT EXISTS rate_limits_window_end_idx ON public.rate_limits (window_end);
