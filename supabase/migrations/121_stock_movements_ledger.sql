-- ============================================================================
-- Migration 121 : journal des mouvements de stock (ledger par produit)
--
-- Chaque changement de products.stock est désormais tracé automatiquement :
-- delta (+/-), solde après, motif, auteur, horodatage. Permet de retrouver
-- rapidement une incohérence (le solde courant doit = somme des deltas).
--
-- Le motif est renseigné par les RPC qui touchent le stock via des variables
-- de session (app.stock_reason / app.stock_source_id). Une modification
-- directe (fiche produit) tombe sur le motif « ajustement ».
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id    uuid NOT NULL REFERENCES products(id)   ON DELETE CASCADE,
  delta         numeric(12,3) NOT NULL,
  balance_after numeric(12,3) NOT NULL,
  reason        text NOT NULL DEFAULT 'ajustement',
  source_id     uuid,
  note          text,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product
  ON public.stock_movements (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_business
  ON public.stock_movements (business_id, created_at DESC);

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stock_movements_select" ON public.stock_movements;
CREATE POLICY "stock_movements_select" ON public.stock_movements FOR SELECT
  USING (business_id = get_user_business_id());

-- Append-only : écriture uniquement par le trigger (SECURITY DEFINER) ou le
-- service_role. Aucune policy INSERT/UPDATE/DELETE pour « authenticated ».
DROP POLICY IF EXISTS "stock_movements_service" ON public.stock_movements;
CREATE POLICY "stock_movements_service" ON public.stock_movements FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

GRANT SELECT ON TABLE public.stock_movements TO authenticated;
GRANT ALL    ON TABLE public.stock_movements TO service_role;


-- ─── Trigger : journalise tout changement de products.stock ─────────────────

CREATE OR REPLACE FUNCTION public._log_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old   numeric;
  v_new   numeric := COALESCE(NEW.stock, 0);
  v_delta numeric;
  v_reason text;
  v_src   uuid;
  v_note  text;
BEGIN
  v_src  := NULLIF(current_setting('app.stock_source_id', true), '')::uuid;
  v_note := NULLIF(current_setting('app.stock_note', true), '');

  IF TG_OP = 'INSERT' THEN
    IF v_new = 0 THEN RETURN NEW; END IF;
    INSERT INTO stock_movements (business_id, product_id, delta, balance_after, reason, source_id, note, created_by)
    VALUES (NEW.business_id, NEW.id, v_new, v_new, 'initial', v_src, v_note, auth.uid());
    RETURN NEW;
  END IF;

  v_old := COALESCE(OLD.stock, 0);
  IF v_old IS NOT DISTINCT FROM v_new THEN
    RETURN NEW;
  END IF;

  v_delta  := v_new - v_old;
  v_reason := COALESCE(NULLIF(current_setting('app.stock_reason', true), ''), 'ajustement');

  INSERT INTO stock_movements (business_id, product_id, delta, balance_after, reason, source_id, note, created_by)
  VALUES (NEW.business_id, NEW.id, v_delta, v_new, v_reason, v_src, v_note, auth.uid());

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Le journal ne doit JAMAIS bloquer une opération de stock (vente, appro…).
  RAISE WARNING 'stock_movements: journalisation échouée pour % : %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_stock_movement ON public.products;
CREATE TRIGGER trg_log_stock_movement
  AFTER INSERT OR UPDATE OF stock ON public.products
  FOR EACH ROW EXECUTE FUNCTION public._log_stock_movement();


-- ─── decrement_stock : motif « vente » ─────────────────────────────────────
-- On unifie sur la signature NUMERIC (+ source facultative) et on supprime les
-- anciennes surcharges pour que tous les appels passent par cette version.

DROP FUNCTION IF EXISTS public.decrement_stock(uuid, integer);
DROP FUNCTION IF EXISTS public.decrement_stock(uuid, numeric);

CREATE OR REPLACE FUNCTION public.decrement_stock(
  p_product_id UUID,
  p_quantity   NUMERIC,
  p_source_id  UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.stock_reason', 'vente', true);
  IF p_source_id IS NOT NULL THEN
    PERFORM set_config('app.stock_source_id', p_source_id::text, true);
  END IF;

  UPDATE products
  SET stock      = GREATEST(0, stock - p_quantity),
      updated_at = NOW()
  WHERE id = p_product_id AND track_stock = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.decrement_stock(uuid, numeric, uuid) TO authenticated, service_role;


-- ─── add_stock_entry : motif « approvisionnement » (corps identique à 117) ──

CREATE OR REPLACE FUNCTION public.add_stock_entry(
  p_business_id   UUID,
  p_product_id    UUID,
  p_quantity      NUMERIC,
  p_packaging_qty  INTEGER  DEFAULT NULL,
  p_packaging_size NUMERIC  DEFAULT NULL,
  p_packaging_unit TEXT     DEFAULT NULL,
  p_supplier      TEXT     DEFAULT NULL,
  p_cost_per_unit NUMERIC  DEFAULT NULL,
  p_notes         TEXT     DEFAULT NULL,
  p_created_by    UUID     DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_role TEXT;
BEGIN
  IF v_uid IS NOT NULL THEN
    SELECT role INTO v_role
    FROM business_members
    WHERE business_id = p_business_id AND user_id = v_uid;

    IF v_role IS NULL THEN
      RAISE EXCEPTION 'ACCES_REFUSE: utilisateur non membre de ce business'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_role NOT IN ('owner', 'admin', 'manager') THEN
      RAISE EXCEPTION 'ACCES_REFUSE: rôle "%" insuffisant pour gérer les stocks', v_role
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF COALESCE(p_quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'QUANTITE_INVALIDE: la quantité doit être strictement positive'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_cost_per_unit IS NOT NULL AND p_cost_per_unit < 0 THEN
    RAISE EXCEPTION 'COUT_INVALIDE: le coût unitaire ne peut pas être négatif'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM products WHERE id = p_product_id AND business_id = p_business_id
  ) THEN
    RAISE EXCEPTION 'Produit introuvable';
  END IF;

  INSERT INTO stock_entries (
    business_id, product_id, quantity,
    packaging_qty, packaging_size, packaging_unit,
    supplier, cost_per_unit, notes, created_by
  )
  VALUES (
    p_business_id, p_product_id, p_quantity,
    p_packaging_qty, p_packaging_size, p_packaging_unit,
    p_supplier, p_cost_per_unit, p_notes, COALESCE(p_created_by, v_uid)
  );

  PERFORM set_config('app.stock_reason', 'approvisionnement', true);

  UPDATE products
  SET stock      = COALESCE(stock, 0) + p_quantity,
      updated_at = NOW()
  WHERE id = p_product_id;
END;
$$;


-- ─── cancel_order : motif « annulation » (corps identique à 119 + set_config) ──

CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id UUID)
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

  PERFORM set_config('app.stock_reason', 'annulation', true);
  PERFORM set_config('app.stock_source_id', p_order_id::text, true);

  FOR v_item IN
    SELECT * FROM order_items WHERE order_id = p_order_id
  LOOP
    UPDATE products
    SET stock      = stock + v_item.quantity,
        updated_at = NOW()
    WHERE id = v_item.product_id
      AND track_stock = true;
  END LOOP;

  PERFORM _release_order_coupons(v_order.coupon_id, v_order.coupon_ids);

  UPDATE orders
  SET status     = 'cancelled',
      updated_at = NOW()
  WHERE id = p_order_id;
END;
$$;


-- ─── refund_order : motif « remboursement » (corps identique à 119 + set_config) ──

CREATE OR REPLACE FUNCTION public.refund_order(
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

  IF p_amount = v_order.total THEN
    PERFORM set_config('app.stock_reason', 'remboursement', true);
    PERFORM set_config('app.stock_source_id', p_order_id::text, true);

    FOR v_item IN
      SELECT * FROM order_items WHERE order_id = p_order_id
    LOOP
      UPDATE products
      SET stock      = stock + v_item.quantity,
          updated_at = NOW()
      WHERE id = v_item.product_id
        AND track_stock = true;
    END LOOP;

    PERFORM _release_order_coupons(v_order.coupon_id, v_order.coupon_ids);
  END IF;

  INSERT INTO refunds (order_id, amount, reason, refunded_by)
  VALUES (p_order_id, p_amount, p_reason, p_refunded_by);

  UPDATE orders
  SET status     = 'refunded',
      updated_at = NOW()
  WHERE id = p_order_id;
END;
$$;


-- ─── update_pending_order : motif « modif_commande » (corps 119 + set_config) ──

DROP FUNCTION IF EXISTS public.update_pending_order(uuid, jsonb, numeric, boolean, text, text, text, numeric, boolean);

CREATE OR REPLACE FUNCTION public.update_pending_order(
  p_order_id        uuid,
  p_items           jsonb,
  p_tax_rate        numeric DEFAULT 0,
  p_tax_inclusive   boolean DEFAULT false,
  p_customer_name   text    DEFAULT NULL,
  p_customer_phone  text    DEFAULT NULL,
  p_notes           text    DEFAULT NULL,
  p_discount_amount numeric DEFAULT NULL,
  p_remove_coupon   boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order    orders%ROWTYPE;
  v_item     order_items%ROWTYPE;
  v_row      jsonb;
  v_paid     numeric;
  v_qty      numeric;
  v_price    numeric;
  v_pid      uuid;
  v_stock    numeric;
  v_track    boolean;
  v_subtotal numeric := 0;
  v_taxable  numeric;
  v_tax      numeric;
  v_total    numeric;
  v_discount numeric;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commande introuvable';
  END IF;
  IF v_order.business_id <> get_user_business_id() THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;
  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'Seules les commandes en attente sont modifiables (statut : %)', v_order.status;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM payments WHERE order_id = p_order_id;
  IF v_paid > 0 THEN
    RAISE EXCEPTION 'Commande déjà partiellement encaissée — modification impossible';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Au moins un article est requis';
  END IF;

  PERFORM set_config('app.stock_reason', 'modif_commande', true);
  PERFORM set_config('app.stock_source_id', p_order_id::text, true);

  FOR v_item IN SELECT * FROM order_items WHERE order_id = p_order_id LOOP
    UPDATE products
    SET stock = stock + v_item.quantity, updated_at = NOW()
    WHERE id = v_item.product_id AND track_stock = true;
  END LOOP;

  DELETE FROM order_items WHERE order_id = p_order_id;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty   := COALESCE((v_row->>'quantity')::numeric, 0);
    v_price := COALESCE((v_row->>'price')::numeric, 0);
    v_pid   := (v_row->>'product_id')::uuid;
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantité invalide pour « % »', COALESCE(v_row->>'name', '?');
    END IF;

    SELECT stock, track_stock INTO v_stock, v_track
    FROM products WHERE id = v_pid FOR UPDATE;

    IF COALESCE(v_track, false) AND COALESCE(v_stock, 0) < v_qty THEN
      RAISE EXCEPTION 'Stock insuffisant pour « % » : % en stock, % demandé(s)',
        COALESCE(v_row->>'name', '?'), COALESCE(v_stock, 0), v_qty;
    END IF;

    INSERT INTO order_items
      (order_id, product_id, variant_id, name, price, quantity, discount_amount, total, notes)
    VALUES (
      p_order_id,
      v_pid,
      NULLIF(v_row->>'variant_id', '')::uuid,
      COALESCE(v_row->>'name', ''),
      v_price,
      v_qty,
      0,
      v_price * v_qty,
      v_row->>'notes'
    );

    UPDATE products
    SET stock = stock - v_qty, updated_at = NOW()
    WHERE id = v_pid AND track_stock = true;

    v_subtotal := v_subtotal + v_price * v_qty;
  END LOOP;

  v_discount := COALESCE(p_discount_amount, v_order.discount_amount, 0);
  IF v_discount < 0 THEN
    RAISE EXCEPTION 'La remise ne peut pas être négative';
  END IF;
  IF v_discount > v_subtotal THEN
    RAISE EXCEPTION 'La remise (%) dépasse le sous-total (%)', v_discount, v_subtotal;
  END IF;

  IF p_remove_coupon THEN
    PERFORM _release_order_coupons(v_order.coupon_id, v_order.coupon_ids);
  END IF;

  v_taxable := v_subtotal - v_discount;
  IF p_tax_inclusive THEN
    v_total := v_taxable;
    v_tax   := CASE WHEN p_tax_rate > 0 THEN round(v_taxable * p_tax_rate / (100 + p_tax_rate), 2) ELSE 0 END;
  ELSE
    v_tax   := round(v_taxable * p_tax_rate / 100, 2);
    v_total := v_taxable + v_tax;
  END IF;

  UPDATE orders SET
    subtotal        = v_subtotal,
    tax_amount      = v_tax,
    discount_amount = v_discount,
    coupon_id       = CASE WHEN p_remove_coupon THEN NULL ELSE coupon_id END,
    coupon_code     = CASE WHEN p_remove_coupon THEN NULL ELSE coupon_code END,
    coupon_notes    = CASE WHEN p_remove_coupon THEN NULL ELSE coupon_notes END,
    coupon_ids      = CASE WHEN p_remove_coupon THEN '[]'::jsonb ELSE coupon_ids END,
    coupon_codes    = CASE WHEN p_remove_coupon THEN '[]'::jsonb ELSE coupon_codes END,
    total           = v_total,
    customer_name   = COALESCE(p_customer_name, customer_name),
    customer_phone  = COALESCE(p_customer_phone, customer_phone),
    notes           = COALESCE(p_notes, notes),
    updated_at      = NOW()
  WHERE id = p_order_id;

  RETURN (SELECT to_jsonb(o.*) FROM orders o WHERE o.id = p_order_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_pending_order(uuid, jsonb, numeric, boolean, text, text, text, numeric, boolean)
  TO authenticated, service_role;
