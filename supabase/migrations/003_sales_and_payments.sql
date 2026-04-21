-- ─── Commandes ────────────────────────────────────────────────────────────────

CREATE TABLE orders (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  cashier_id      UUID NOT NULL REFERENCES users(id),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled','refunded')),
  subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total           NUMERIC(12,2) NOT NULL DEFAULT 0,
  coupon_id       UUID REFERENCES coupons(id) ON DELETE SET NULL,
  coupon_code     TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_business    ON orders(business_id, created_at DESC);
CREATE INDEX idx_orders_cashier     ON orders(cashier_id);
CREATE INDEX idx_orders_status      ON orders(business_id, status);
CREATE INDEX idx_orders_date_status ON orders(business_id, status, created_at);


-- ─── Articles de commande ─────────────────────────────────────────────────────

CREATE TABLE order_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id),
  variant_id      TEXT,
  name            TEXT NOT NULL,   -- snapshot
  price           NUMERIC(12,2) NOT NULL,
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total           NUMERIC(12,2) NOT NULL,
  notes           TEXT
);

CREATE INDEX idx_order_items_order   ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);


-- ─── Paiements ────────────────────────────────────────────────────────────────

CREATE TABLE payments (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id  UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method    TEXT NOT NULL CHECK (method IN ('cash','card','mobile_money','partial')),
  amount    NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  reference TEXT,
  paid_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_order ON payments(order_id);


ALTER TABLE orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders_select" ON orders FOR SELECT
  USING (business_id = get_user_business_id()
         AND (cashier_id = auth.uid() OR get_user_role() IN ('admin','owner')));

CREATE POLICY "orders_insert" ON orders FOR INSERT
  WITH CHECK (business_id = get_user_business_id());

CREATE POLICY "orders_update" ON orders FOR UPDATE
  USING (business_id = get_user_business_id()
         AND get_user_role() IN ('admin','owner'));

-- order_items & payments : via l'order_id
CREATE POLICY "order_items_select" ON order_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_items.order_id
      AND o.business_id = get_user_business_id()
  ));

CREATE POLICY "payments_select" ON payments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = payments.order_id
      AND o.business_id = get_user_business_id()
  ));

-- coupons : lecture par tous, gestion par admin/owner

-- File: 005_refund_cancel.sql
-- ============================================================
-- ELM APP — Annulation et remboursement transactionnels
-- À exécuter dans : Supabase Dashboard > SQL Editor
-- ============================================================

-- Table de traçabilité des remboursements
CREATE TABLE IF NOT EXISTS refunds (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount       NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  reason       TEXT,
  refunded_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  refunded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds(order_id);

ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "refunds_select" ON refunds FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = refunds.order_id
      AND o.business_id = get_user_business_id()
  ));

CREATE POLICY "refunds_insert" ON refunds FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = refunds.order_id
      AND o.business_id = get_user_business_id()
      AND get_user_role() IN ('admin', 'owner')
  ));

-- ─── Annulation transactionnelle ─────────────────────────────────────────────
-- Restaure le stock ET décrémente le coupon EN UNE SEULE TRANSACTION

CREATE OR REPLACE FUNCTION cancel_order(p_order_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_item  order_items%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commande introuvable';
  END IF;

  IF v_order.status NOT IN ('paid', 'pending') THEN
    RAISE EXCEPTION 'Impossible d''annuler une commande avec le statut : %', v_order.status;
  END IF;

  -- Restaurer le stock pour chaque article
  FOR v_item IN
    SELECT * FROM order_items WHERE order_id = p_order_id
  LOOP
    UPDATE products
    SET stock      = stock + v_item.quantity,
        updated_at = NOW()
    WHERE id = v_item.product_id
      AND track_stock = true;
  END LOOP;

  -- Décrémenter le compteur coupon si appliqué
  IF v_order.coupon_id IS NOT NULL THEN
    UPDATE coupons
    SET uses_count = GREATEST(0, uses_count - 1)
    WHERE id = v_order.coupon_id;
  END IF;

  -- Marquer comme annulée
  UPDATE orders
  SET status     = 'cancelled',
      updated_at = NOW()
  WHERE id = p_order_id;
END;
$$;

-- ─── Remboursement transactionnel ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION refund_order(
  p_order_id    UUID,
  p_amount      NUMERIC,
  p_reason      TEXT    DEFAULT NULL,
  p_refunded_by UUID    DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_item  order_items%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commande introuvable';
  END IF;

  IF v_order.status <> 'paid' THEN
    RAISE EXCEPTION 'Seules les commandes payées peuvent être remboursées (statut actuel : %)', v_order.status;
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Le montant du remboursement doit être positif';
  END IF;

  IF p_amount > v_order.total THEN
    RAISE EXCEPTION 'Le remboursement (%) dépasse le total de la commande (%)',
      p_amount, v_order.total;
  END IF;

  -- Remboursement TOTAL → restaurer le stock et le coupon
  IF p_amount = v_order.total THEN
    FOR v_item IN
      SELECT * FROM order_items WHERE order_id = p_order_id
    LOOP
      UPDATE products
      SET stock      = stock + v_item.quantity,
          updated_at = NOW()
      WHERE id = v_item.product_id
        AND track_stock = true;
    END LOOP;

    IF v_order.coupon_id IS NOT NULL THEN
      UPDATE coupons
      SET uses_count = GREATEST(0, uses_count - 1)
      WHERE id = v_order.coupon_id;
    END IF;
  END IF;
  -- Remboursement PARTIEL → pas de restauration de stock (produits conservés)

  -- Enregistrer dans la table refunds
  INSERT INTO refunds (order_id, amount, reason, refunded_by)
  VALUES (p_order_id, p_amount, p_reason, p_refunded_by);

  -- Mettre à jour le statut de la commande
  UPDATE orders
  SET status     = 'refunded',
      updated_at = NOW()
  WHERE id = p_order_id;
END;
$$;


-- File: 006_delivery.sql
-- ============================================================
-- ELM APP — Système de vérification livraison / picking
-- À exécuter dans : Supabase Dashboard > SQL Editor
-- ============================================================

-- Statut de livraison sur la commande
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'picking', 'delivered')),
  ADD COLUMN IF NOT EXISTS delivered_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivered_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_delivery ON orders(business_id, delivery_status)
  WHERE status = 'paid';

-- Fonction : démarrer le picking
CREATE OR REPLACE FUNCTION start_order_picking(p_order_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  UPDATE orders
  SET delivery_status = 'picking',
      updated_at      = NOW()
  WHERE id = p_order_id
    AND status = 'paid'
    AND delivery_status = 'pending';
END;
$$;

-- Fonction : valider la livraison
CREATE OR REPLACE FUNCTION confirm_order_delivery(
  p_order_id     UUID,
  p_delivered_by UUID
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  UPDATE orders
  SET delivery_status = 'delivered',
      delivered_by    = p_delivered_by,
      delivered_at    = NOW(),
      updated_at      = NOW()
  WHERE id = p_order_id
    AND status = 'paid'
    AND delivery_status IN ('pending', 'picking');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commande introuvable ou déjà livrée';
  END IF;
END;
$$;


-- File: 008_complete_payment_rpc.sql
-- ============================================================
-- Migration 008 : RPC complète pour enregistrer le solde d'un acompte
-- ============================================================

CREATE OR REPLACE FUNCTION complete_order_payment(
  p_order_id UUID,
  p_method   TEXT,
  p_amount   NUMERIC
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_order      orders%ROWTYPE;
  v_total_paid NUMERIC;
BEGIN
  -- Verrouiller la commande
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commande introuvable';
  END IF;

  IF v_order.status NOT IN ('pending') THEN
    RAISE EXCEPTION 'Cette commande ne peut plus recevoir de paiement complémentaire (statut : %)', v_order.status;
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Le montant doit être positif';
  END IF;

  -- Insérer le paiement complémentaire
  INSERT INTO payments (order_id, method, amount)
  VALUES (p_order_id, p_method, p_amount);

  -- Calculer le total payé
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM payments WHERE order_id = p_order_id;

  -- Marquer comme payée si solde atteint
  IF v_total_paid >= v_order.total - 0.01 THEN
    UPDATE orders SET status = 'paid', updated_at = NOW() WHERE id = p_order_id;
  END IF;
END;
$$;


-- File: 015_fix_delivery_pending.sql
-- ============================================================
-- Migration 015 : Correction livraison pour commandes acompte
-- Les commandes avec acompte ont status='pending' mais doivent
-- pouvoir être livrées (start_order_picking + confirm_order_delivery).
-- ============================================================

-- Correction de l'index (inclut aussi les commandes pending)
DROP INDEX IF EXISTS idx_orders_delivery;
CREATE INDEX IF NOT EXISTS idx_orders_delivery
  ON orders(business_id, delivery_status)
  WHERE status IN ('paid', 'pending');

-- Correction : start_order_picking accepte paid ET pending
CREATE OR REPLACE FUNCTION start_order_picking(p_order_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  UPDATE orders
  SET delivery_status = 'picking',
      updated_at      = NOW()
  WHERE id = p_order_id
    AND status IN ('paid', 'pending')
    AND delivery_status = 'pending';
END;
$$;

-- Correction : confirm_order_delivery accepte paid ET pending
CREATE OR REPLACE FUNCTION confirm_order_delivery(
  p_order_id     UUID,
  p_delivered_by UUID
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  UPDATE orders
  SET delivery_status = 'delivered',
      delivered_by    = p_delivered_by,
      delivered_at    = NOW(),
      updated_at      = NOW()
  WHERE id = p_order_id
    AND status IN ('paid', 'pending')
    AND delivery_status IN ('pending', 'picking');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commande introuvable ou déjà livrée';
  END IF;
END;
$$;


-- File: 032_cash_sessions.sql
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


-- File: 055_shipping_options.sql
-- Shipping options configuration on whatsapp_configs
ALTER TABLE whatsapp_configs
  ADD COLUMN IF NOT EXISTS enable_pickup    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_delivery  BOOLEAN NOT NULL DEFAULT false;

-- Delivery info on orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_type     TEXT,      -- 'pickup' | 'delivery'
  ADD COLUMN IF NOT EXISTS delivery_address  TEXT,
  ADD COLUMN IF NOT EXISTS delivery_location JSONB;     -- { latitude, longitude, name?, address? }


-- File: 059_livreurs.sql
CREATE TABLE livreurs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS livreur_id UUID REFERENCES livreurs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_livreurs_business ON livreurs(business_id) WHERE is_active;

ALTER TABLE livreurs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "livreurs: members read" ON livreurs FOR SELECT USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));
CREATE POLICY "livreurs: manager write" ON livreurs FOR ALL USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid() AND role IN ('owner','admin','manager')));
CREATE POLICY "livreurs: service_role" ON livreurs FOR ALL USING (auth.role() = 'service_role');


-- File: 080_intouch_payments.sql
-- Migration: Intouch (TouchPay) Integration
-- Description: Adds configuration table for Intouch payment gateway

CREATE TABLE IF NOT EXISTS intouch_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE UNIQUE,
  partner_id text NOT NULL,
  api_key text NOT NULL,
  merchant_id text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE intouch_configs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can see their business intouch config"
  ON intouch_configs FOR SELECT
  USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "Owners can manage their business intouch config"
  ON intouch_configs FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));

-- Grant access to service role (for edge functions)
GRANT ALL ON intouch_configs TO service_role;

-- Add to realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'intouch_configs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE intouch_configs;
  END IF;
END $$;


-- File: 081_payment_robustness.sql
-- Migration: Payment Transactions & Security
-- Description: Robust tracking of payment attempts and sensitive config security

-- 1. Create a table to track all payment attempts (Audit Trail & Reliability)
CREATE TABLE IF NOT EXISTS payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  order_id text, -- Can be null if order not yet created
  transaction_id text UNIQUE, -- Provider transaction ID (e.g. Intouch ID)
  external_reference text, -- Our internal unique reference sent to provider
  amount numeric(12, 2) NOT NULL,
  currency text DEFAULT 'XOF',
  provider text NOT NULL, -- 'WAVE', 'ORANGE_MONEY', 'FREE_MONEY', 'INTOUCH'
  method text NOT NULL, -- 'push', 'qr', etc.
  phone text,
  status text NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'SUCCESS', 'FAILED', 'CANCELLED'
  provider_response jsonb, -- Store raw response for debugging
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for performance and searching
CREATE INDEX IF NOT EXISTS idx_payment_transactions_business_id ON payment_transactions(business_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_external_reference ON payment_transactions(external_reference);

-- Enable RLS
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their business transactions"
  ON payment_transactions FOR SELECT
  USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

-- 2. Improve Security for intouch_configs
-- We should NEVER select the api_key from the client.
-- Let's create a view for the client that excludes the key.

CREATE OR REPLACE VIEW intouch_configs_public AS
SELECT id, business_id, partner_id, merchant_id, is_active, created_at, updated_at
FROM intouch_configs;

-- Only Edge Functions (service_role) should see the api_key.
-- Revoke all on the base table from authenticated/anon, grant only to service_role.
REVOKE ALL ON intouch_configs FROM authenticated, anon;
GRANT SELECT ON intouch_configs_public TO authenticated;

-- 3. Function to update transaction status (Reliability)
CREATE OR REPLACE FUNCTION update_payment_transaction_status(
  p_external_ref text,
  p_status text,
  p_transaction_id text DEFAULT NULL,
  p_response jsonb DEFAULT NULL,
  p_error text DEFAULT NULL
) RETURNS void AS $$
BEGIN
  UPDATE payment_transactions
  SET 
    status = p_status,
    transaction_id = COALESCE(p_transaction_id, transaction_id),
    provider_response = COALESCE(p_response, provider_response),
    error_message = COALESCE(p_error, error_message),
    updated_at = now()
  WHERE external_reference = p_external_ref;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
