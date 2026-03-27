-- ═══════════════════════════════════════════════════════════════════════════════
-- 035 - Performance indexes on frequently queried columns
--
-- All indexes use IF NOT EXISTS so this migration is safe to re-run.
-- Organized by table, highest-impact first within each section.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── orders ───────────────────────────────────────────────────────────────────

-- Coupon analytics: .not('coupon_code', 'is', null) + GROUP BY coupon_code
CREATE INDEX IF NOT EXISTS idx_orders_coupon_code
  ON public.orders (business_id, coupon_code)
  WHERE coupon_code IS NOT NULL;

-- Coupon FK lookups (validate_coupon, per-user limit checks)
CREATE INDEX IF NOT EXISTS idx_orders_coupon_id
  ON public.orders (business_id, coupon_id)
  WHERE coupon_id IS NOT NULL;

-- Wholesale / reseller analytics: .not('reseller_client_id', 'is', null)
CREATE INDEX IF NOT EXISTS idx_orders_biz_type
  ON public.orders (business_id, order_type)
  WHERE order_type = 'wholesale';

-- Customer order history: .eq('customer_phone', phone)
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone
  ON public.orders (business_id, customer_phone)
  WHERE customer_phone IS NOT NULL;

-- Acompte / partial payment lookups: orders with remaining balance
CREATE INDEX IF NOT EXISTS idx_orders_partial_status
  ON public.orders (business_id, status, created_at DESC)
  WHERE status = 'partial';

-- ─── payments ─────────────────────────────────────────────────────────────────

-- Cash session close RPC: SUM per method per order
-- (existing idx_payments_order covers order_id; add method for covering index)
CREATE INDEX IF NOT EXISTS idx_payments_order_method
  ON public.payments (order_id, method);

-- Business-level payment method analytics (revenue by method)
CREATE INDEX IF NOT EXISTS idx_payments_method_paid_at
  ON public.payments (method, paid_at DESC);

-- ─── order_items ──────────────────────────────────────────────────────────────

-- Product sales analytics: "best sellers" → GROUP BY product_id
CREATE INDEX IF NOT EXISTS idx_order_items_product_qty
  ON public.order_items (product_id, quantity);

-- ─── refunds ──────────────────────────────────────────────────────────────────

-- Cash session close RPC: SUM(amount) WHERE refunded_at >= session.opened_at
CREATE INDEX IF NOT EXISTS idx_refunds_refunded_at
  ON public.refunds (refunded_at DESC);

-- Compound for the cash-session close subquery pattern:
-- JOIN orders ON orders.id = refunds.order_id WHERE orders.business_id = ?
CREATE INDEX IF NOT EXISTS idx_refunds_order_date
  ON public.refunds (order_id, refunded_at DESC);

-- ─── products ─────────────────────────────────────────────────────────────────

-- Product list sorted by name: .order('name') in getProducts
CREATE INDEX IF NOT EXISTS idx_products_name
  ON public.products (business_id, name)
  WHERE is_active = true;

-- decrement_stock RPC: UPDATE products WHERE id = ? AND track_stock = true
CREATE INDEX IF NOT EXISTS idx_products_track_stock
  ON public.products (id)
  WHERE track_stock = true;

-- Low-stock alerts: .lte('stock', threshold) + .eq('track_stock', true)
CREATE INDEX IF NOT EXISTS idx_products_stock_level
  ON public.products (business_id, stock)
  WHERE is_active = true AND track_stock = true;

-- ─── categories ───────────────────────────────────────────────────────────────

-- Category list is always ordered by sort_order
CREATE INDEX IF NOT EXISTS idx_categories_sort
  ON public.categories (business_id, sort_order);

-- ─── users ────────────────────────────────────────────────────────────────────

-- Superadmin authorization checks in RPCs (activate_subscription, etc.)
-- Used as: WHERE id = auth.uid() AND is_superadmin = true
CREATE INDEX IF NOT EXISTS idx_users_superadmin
  ON public.users (id)
  WHERE is_superadmin = true;

-- Block status checks
CREATE INDEX IF NOT EXISTS idx_users_blocked
  ON public.users (id)
  WHERE is_blocked = true;

-- last_seen_at for session inactivity monitoring (column added in 033)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'last_seen_at'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_users_last_seen
             ON public.users (last_seen_at DESC)
             WHERE last_seen_at IS NOT NULL';
  END IF;
END;
$$;

-- ─── business_members ─────────────────────────────────────────────────────────

-- get_user_business_id() / get_user_role() called in every RLS policy:
-- SELECT business_id/role FROM business_members WHERE user_id = auth.uid()
CREATE INDEX IF NOT EXISTS idx_business_members_user
  ON public.business_members (user_id);

-- Role-based filtering in JOINs (get_all_subscriptions, admin guards)
CREATE INDEX IF NOT EXISTS idx_business_members_biz_role
  ON public.business_members (business_id, role);

-- ─── subscriptions ────────────────────────────────────────────────────────────

-- Direct business subscription lookup: .eq('business_id', id)
CREATE INDEX IF NOT EXISTS idx_subscriptions_business
  ON public.subscriptions (business_id);

-- Status-based expiry checks: WHERE status = 'active' AND expires_at < now()
CREATE INDEX IF NOT EXISTS idx_subscriptions_status_expiry
  ON public.subscriptions (status, expires_at)
  WHERE status IN ('active', 'trial');

-- ─── subscription_requests ────────────────────────────────────────────────────

-- Backoffice request queue: pending requests first
CREATE INDEX IF NOT EXISTS idx_sub_requests_status
  ON public.subscription_requests (status, created_at DESC)
  WHERE status = 'pending';

-- Business request history
CREATE INDEX IF NOT EXISTS idx_sub_requests_business
  ON public.subscription_requests (business_id, created_at DESC);

-- ─── cash_sessions ────────────────────────────────────────────────────────────

-- Closed session history with date filter
CREATE INDEX IF NOT EXISTS idx_cash_sessions_closed
  ON public.cash_sessions (business_id, closed_at DESC)
  WHERE status = 'closed';

-- ─── activity_logs ────────────────────────────────────────────────────────────

-- Entity drill-down: "show all logs for order X" or "for product Y"
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity
  ON public.activity_logs (business_id, entity_type, entity_id)
  WHERE entity_id IS NOT NULL;

-- Action + date compound for filtered journal views
CREATE INDEX IF NOT EXISTS idx_activity_logs_action_date
  ON public.activity_logs (business_id, action, created_at DESC);

-- ─── stock_entries ────────────────────────────────────────────────────────────

-- Product-level stock history with date range
CREATE INDEX IF NOT EXISTS idx_stock_entries_product_date
  ON public.stock_entries (product_id, created_at DESC);

-- Supplier analytics
CREATE INDEX IF NOT EXISTS idx_stock_entries_supplier
  ON public.stock_entries (business_id, supplier)
  WHERE supplier IS NOT NULL;

-- ─── journal_entries (accounting) ─────────────────────────────────────────────

-- Date-range queries: .gte('entry_date').lte('entry_date') + ORDER BY entry_date
CREATE INDEX IF NOT EXISTS idx_journal_entries_date
  ON public.journal_entries (business_id, entry_date DESC);

-- Source filtering: WHERE source = 'order' | 'refund' | 'manual'
CREATE INDEX IF NOT EXISTS idx_journal_entries_source
  ON public.journal_entries (business_id, source);

-- NOT EXISTS check in sync_accounting RPC: source_id lookup
CREATE INDEX IF NOT EXISTS idx_journal_entries_source_id
  ON public.journal_entries (source, source_id)
  WHERE source_id IS NOT NULL;

-- ─── snapshots ────────────────────────────────────────────────────────────────

-- Type-filtered listing (separate manual vs auto vs pre_restore)
CREATE INDEX IF NOT EXISTS idx_snapshots_type
  ON public.snapshots (business_id, type, created_at DESC);

-- ─── rate_limits ──────────────────────────────────────────────────────────────

-- Window expiry cleanup: DELETE FROM rate_limits WHERE window_end < now()
-- (already has rate_limits_window_end_idx from 033 — adding covering index)
CREATE INDEX IF NOT EXISTS idx_rate_limits_key_window
  ON public.rate_limits (key, window_end);
