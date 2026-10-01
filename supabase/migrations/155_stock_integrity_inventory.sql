-- ============================================================================
-- Migration 155 : fiabilité du stock + inventaire physique (comptage)
--
--   S1. decrement_stock ne masque plus les surventes.
--       GREATEST(0, stock - qty) ramenait le stock à 0 et le journal
--       n'enregistrait que la partie « disponible » : l'unité vendue en trop
--       disparaissait sans trace. Le stock peut désormais passer en négatif —
--       signal explicite qu'un comptage est nécessaire. (create_order refuse
--       déjà la survente en amont ; ce cas ne concerne que les autres chemins.)
--
--   S2. adjust_stock : ajustement manuel sans écrasement.
--       La fiche produit envoyait la quantité absolue : une vente passée entre
--       l'ouverture et l'enregistrement de la fiche était effacée. La RPC
--       exige la quantité vue par l'utilisateur (p_expected) et refuse
--       l'ajustement si le stock a bougé entre-temps (STOCK_A_CHANGE:<actuel>).
--       Motif journalisé + écriture comptable dans la même transaction.
--
--   S3. Inventaire physique : sessions de comptage + lignes comptées.
--       Chaque ligne fige le stock théorique AU MOMENT DU COMPTAGE
--       (expected_qty). À la validation on applique l'ÉCART (compté -
--       théorique) et non la quantité comptée : les ventes passées entre le
--       comptage et la validation restent donc correctement déduites.
--       Les produits non comptés ne sont pas modifiés (inventaire partiel /
--       tournant possible).
-- ============================================================================


-- ─── Helper : rôle de l'appelant sur un business ───────────────────────────
-- Renvoie NULL si l'appelant n'est pas membre. auth.uid() NULL => service_role.
CREATE OR REPLACE FUNCTION public._stock_caller_role(p_business_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN 'service'
    ELSE (SELECT role FROM business_members
          WHERE business_id = p_business_id AND user_id = auth.uid()
          LIMIT 1)
  END;
$$;

REVOKE ALL ON FUNCTION public._stock_caller_role(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._stock_caller_role(uuid) TO authenticated, service_role;


-- ─── S1. decrement_stock : plus de plancher à 0 ────────────────────────────
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
  SET stock      = COALESCE(stock, 0) - p_quantity,
      updated_at = NOW()
  WHERE id = p_product_id AND track_stock = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.decrement_stock(uuid, numeric, uuid) TO authenticated, service_role;


-- ─── S2. adjust_stock : ajustement manuel avec contrôle de concurrence ─────
CREATE OR REPLACE FUNCTION public.adjust_stock(
  p_product_id uuid,
  p_expected   numeric,
  p_new_qty    numeric,
  p_reason     text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prod products%ROWTYPE;
  v_role text;
  v_cur  numeric;
BEGIN
  SELECT * INTO v_prod FROM products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produit introuvable';
  END IF;

  v_role := _stock_caller_role(v_prod.business_id);
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'manager', 'service') THEN
    RAISE EXCEPTION 'ACCES_REFUSE: rôle insuffisant pour ajuster le stock'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT COALESCE(v_prod.track_stock, false) THEN
    RAISE EXCEPTION 'Le suivi de stock n''est pas activé pour ce produit';
  END IF;
  IF p_new_qty IS NULL OR p_new_qty < 0 THEN
    RAISE EXCEPTION 'QUANTITE_INVALIDE: la quantité ne peut pas être négative'
      USING ERRCODE = 'check_violation';
  END IF;

  v_cur := COALESCE(v_prod.stock, 0);
  IF round(v_cur, 3) <> round(COALESCE(p_expected, 0), 3) THEN
    RAISE EXCEPTION 'STOCK_A_CHANGE:%', v_cur;
  END IF;
  IF round(v_cur, 3) = round(p_new_qty, 3) THEN
    RETURN v_cur;
  END IF;

  PERFORM set_config('app.stock_reason', 'ajustement', true);
  PERFORM set_config('app.stock_note', COALESCE(NULLIF(trim(p_reason), ''), ''), true);

  UPDATE products
  SET stock = p_new_qty, updated_at = NOW()
  WHERE id = p_product_id;

  -- L'écriture comptable ne doit jamais bloquer l'ajustement physique.
  BEGIN
    PERFORM record_stock_adjustment(p_product_id, v_cur, p_new_qty, NULLIF(trim(p_reason), ''));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'adjust_stock: écriture comptable échouée pour % : %', p_product_id, SQLERRM;
  END;

  RETURN p_new_qty;
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid, numeric, numeric, text) TO authenticated, service_role;


-- ─── S3. Tables d'inventaire ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inventory_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name         text NOT NULL,
  status       text NOT NULL DEFAULT 'open'
               CHECK (status IN ('open', 'validated', 'cancelled')),
  category_id  uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  notes        text,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  validated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  validated_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_inventory_sessions_business
  ON public.inventory_sessions (business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.inventory_count_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES public.inventory_sessions(id) ON DELETE CASCADE,
  business_id   uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id    uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  -- Stock théorique figé au premier comptage de la ligne
  expected_qty  numeric(12,3) NOT NULL,
  counted_qty   numeric(12,3) NOT NULL CHECK (counted_qty >= 0),
  reason        text,
  counted_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  counted_at    timestamptz NOT NULL DEFAULT now(),
  -- Renseignés à la validation (rapport figé, indépendant des prix futurs)
  applied_delta numeric(12,3),
  unit_cost     numeric(14,2),
  unit_price    numeric(14,2),
  UNIQUE (session_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_lines_session
  ON public.inventory_count_lines (session_id);
CREATE INDEX IF NOT EXISTS idx_inventory_lines_product
  ON public.inventory_count_lines (product_id);

ALTER TABLE public.inventory_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_count_lines ENABLE ROW LEVEL SECURITY;

-- Lecture par les membres du business. Écritures uniquement via les RPC
-- ci-dessous (SECURITY DEFINER) : aucune policy INSERT/UPDATE/DELETE.
DROP POLICY IF EXISTS "inventory_sessions_select" ON public.inventory_sessions;
CREATE POLICY "inventory_sessions_select" ON public.inventory_sessions
  FOR SELECT TO authenticated
  USING (business_id IN (
    SELECT business_id FROM public.business_members WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "inventory_count_lines_select" ON public.inventory_count_lines;
CREATE POLICY "inventory_count_lines_select" ON public.inventory_count_lines
  FOR SELECT TO authenticated
  USING (business_id IN (
    SELECT business_id FROM public.business_members WHERE user_id = auth.uid()
  ));

GRANT SELECT ON TABLE public.inventory_sessions    TO authenticated;
GRANT SELECT ON TABLE public.inventory_count_lines TO authenticated;
GRANT ALL    ON TABLE public.inventory_sessions    TO service_role;
GRANT ALL    ON TABLE public.inventory_count_lines TO service_role;


-- ─── RPC : créer une session ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_inventory_session(
  p_business_id uuid,
  p_name        text,
  p_category_id uuid DEFAULT NULL,
  p_notes       text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := _stock_caller_role(p_business_id);
  v_id   uuid;
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'manager', 'service') THEN
    RAISE EXCEPTION 'ACCES_REFUSE: rôle insuffisant pour lancer un inventaire'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM categories WHERE id = p_category_id AND business_id = p_business_id
  ) THEN
    RAISE EXCEPTION 'Catégorie introuvable';
  END IF;

  INSERT INTO inventory_sessions (business_id, name, category_id, notes, created_by)
  VALUES (
    p_business_id,
    COALESCE(NULLIF(trim(p_name), ''), 'Inventaire du ' || to_char(now(), 'DD/MM/YYYY')),
    p_category_id,
    NULLIF(trim(p_notes), ''),
    auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_inventory_session(uuid, text, uuid, text) TO authenticated, service_role;


-- ─── RPC : saisir / corriger / effacer un comptage ─────────────────────────
-- p_counted_qty NULL => la ligne est supprimée (produit « non compté »).
-- Tout membre du business peut compter ; seule la validation est restreinte.
CREATE OR REPLACE FUNCTION public.set_inventory_count(
  p_session_id  uuid,
  p_product_id  uuid,
  p_counted_qty numeric,
  p_reason      text DEFAULT NULL
)
RETURNS public.inventory_count_lines
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sess inventory_sessions%ROWTYPE;
  v_prod products%ROWTYPE;
  v_line inventory_count_lines%ROWTYPE;
BEGIN
  SELECT * INTO v_sess FROM inventory_sessions WHERE id = p_session_id;
  IF NOT FOUND OR _stock_caller_role(v_sess.business_id) IS NULL THEN
    RAISE EXCEPTION 'Inventaire introuvable';
  END IF;
  IF v_sess.status <> 'open' THEN
    RAISE EXCEPTION 'INVENTAIRE_CLOS: cet inventaire est déjà validé ou annulé';
  END IF;

  SELECT * INTO v_prod FROM products
  WHERE id = p_product_id AND business_id = v_sess.business_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produit introuvable';
  END IF;
  IF NOT COALESCE(v_prod.track_stock, false) THEN
    RAISE EXCEPTION 'Le suivi de stock n''est pas activé pour « % »', v_prod.name;
  END IF;

  IF p_counted_qty IS NULL THEN
    DELETE FROM inventory_count_lines
    WHERE session_id = p_session_id AND product_id = p_product_id
    RETURNING * INTO v_line;
    RETURN v_line;
  END IF;

  IF p_counted_qty < 0 THEN
    RAISE EXCEPTION 'QUANTITE_INVALIDE: la quantité comptée ne peut pas être négative'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO inventory_count_lines
    (session_id, business_id, product_id, expected_qty, counted_qty, reason, counted_by)
  VALUES
    (p_session_id, v_sess.business_id, p_product_id, COALESCE(v_prod.stock, 0),
     p_counted_qty, NULLIF(trim(p_reason), ''), auth.uid())
  ON CONFLICT (session_id, product_id) DO UPDATE
    SET counted_qty = EXCLUDED.counted_qty,
        reason      = EXCLUDED.reason,
        counted_by  = EXCLUDED.counted_by,
        counted_at  = now()
        -- expected_qty volontairement conservé (figé au premier comptage)
  RETURNING * INTO v_line;

  UPDATE inventory_sessions SET updated_at = now() WHERE id = p_session_id;
  RETURN v_line;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_inventory_count(uuid, uuid, numeric, text) TO authenticated, service_role;


-- ─── RPC : valider (applique les écarts) ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.validate_inventory_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sess     inventory_sessions%ROWTYPE;
  v_role     text;
  v_line     record;
  v_delta    numeric;
  v_before   numeric;
  v_cost     numeric;
  v_adjusted int := 0;
  v_counted  int := 0;
BEGIN
  SELECT * INTO v_sess FROM inventory_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventaire introuvable';
  END IF;

  v_role := _stock_caller_role(v_sess.business_id);
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'manager', 'service') THEN
    RAISE EXCEPTION 'ACCES_REFUSE: rôle insuffisant pour valider un inventaire'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_sess.status <> 'open' THEN
    RAISE EXCEPTION 'INVENTAIRE_CLOS: cet inventaire est déjà validé ou annulé';
  END IF;

  PERFORM set_config('app.stock_reason', 'inventaire', true);
  PERFORM set_config('app.stock_source_id', p_session_id::text, true);

  -- Verrouillage des produits dans un ordre stable (évite les interblocages
  -- avec des ventes concurrentes).
  FOR v_line IN
    SELECT l.id, l.product_id, l.expected_qty, l.counted_qty, l.reason,
           p.name, p.price, p.cost_price, COALESCE(p.stock, 0) AS stock, p.track_stock
    FROM inventory_count_lines l
    JOIN products p ON p.id = l.product_id
    WHERE l.session_id = p_session_id
    ORDER BY l.product_id
    FOR UPDATE OF p
  LOOP
    v_counted := v_counted + 1;
    v_delta   := round(v_line.counted_qty - v_line.expected_qty, 3);

    SELECT SUM(quantity * cost_per_unit) / NULLIF(SUM(quantity), 0)
      INTO v_cost
    FROM stock_entries
    WHERE product_id = v_line.product_id
      AND cost_per_unit IS NOT NULL AND cost_per_unit > 0 AND quantity > 0;
    v_cost := COALESCE(v_cost, v_line.cost_price);

    IF v_delta <> 0 AND COALESCE(v_line.track_stock, false) THEN
      v_before := v_line.stock;
      PERFORM set_config('app.stock_note',
        COALESCE(NULLIF(trim(v_line.reason), ''), 'écart d''inventaire'), true);

      UPDATE products
      SET stock = v_before + v_delta, updated_at = NOW()
      WHERE id = v_line.product_id;

      BEGIN
        PERFORM record_stock_adjustment(
          v_line.product_id, v_before, v_before + v_delta,
          'Inventaire « ' || v_sess.name || ' »'
            || COALESCE(' — ' || NULLIF(trim(v_line.reason), ''), ''));
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'validate_inventory_session: écriture comptable échouée pour % : %',
          v_line.product_id, SQLERRM;
      END;

      v_adjusted := v_adjusted + 1;
    ELSE
      v_delta := 0;
    END IF;

    UPDATE inventory_count_lines
    SET applied_delta = v_delta,
        unit_cost     = round(v_cost, 2),
        unit_price    = v_line.price
    WHERE id = v_line.id;
  END LOOP;

  UPDATE inventory_sessions
  SET status = 'validated', validated_by = auth.uid(), validated_at = now(), updated_at = now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object('counted', v_counted, 'adjusted', v_adjusted);
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_inventory_session(uuid) TO authenticated, service_role;


-- ─── RPC : annuler (aucun stock modifié) ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_inventory_session(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sess inventory_sessions%ROWTYPE;
  v_role text;
BEGIN
  SELECT * INTO v_sess FROM inventory_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventaire introuvable';
  END IF;
  v_role := _stock_caller_role(v_sess.business_id);
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'manager', 'service') THEN
    RAISE EXCEPTION 'ACCES_REFUSE: rôle insuffisant pour annuler un inventaire'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_sess.status <> 'open' THEN
    RAISE EXCEPTION 'INVENTAIRE_CLOS: cet inventaire est déjà validé ou annulé';
  END IF;

  UPDATE inventory_sessions
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_session_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_inventory_session(uuid) TO authenticated, service_role;

GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
