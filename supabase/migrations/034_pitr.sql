-- ═══════════════════════════════════════════════════════════════════════════════
-- 034 - Point-in-Time Recovery (PITR)
-- ● snapshots table : JSON dump of products / categories / coupons per business
-- ● create_snapshot  : manual or automatic snapshot
-- ● get_snapshots    : lightweight list (no large data payload)
-- ● restore_snapshot : selective restore with pre-restore safety snapshot
-- ● auto_snapshot_all_businesses : called by pg_cron daily
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 0. Ensure check_rate_limit exists (defined in 033, re-declared here so
--        this migration is self-contained if run independently) ────────────────

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key        text        NOT NULL,
  count      int         NOT NULL DEFAULT 1,
  window_end timestamptz NOT NULL,
  PRIMARY KEY (key)
);

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
                       WHEN rate_limits.window_end < v_now THEN 1
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

-- ─── 1. Snapshots table ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.snapshots (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  created_by  uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  label       text,
  type        text        NOT NULL DEFAULT 'manual'
                          CHECK (type IN ('manual', 'auto', 'pre_restore')),
  -- Counts stored separately so get_snapshots doesn't need to parse the blob
  product_count   int  NOT NULL DEFAULT 0,
  category_count  int  NOT NULL DEFAULT 0,
  coupon_count    int  NOT NULL DEFAULT 0,
  -- Full data snapshot (can be several hundred KB for large catalogues)
  data        jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS snapshots_business_created
  ON public.snapshots (business_id, created_at DESC);

-- ─── 2. RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE public.snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "snapshots_select"    ON public.snapshots;
DROP POLICY IF EXISTS "snapshots_insert"    ON public.snapshots;
DROP POLICY IF EXISTS "snapshots_delete"    ON public.snapshots;
DROP POLICY IF EXISTS "snapshots_no_update" ON public.snapshots;

-- Any member of the business can read snapshots
CREATE POLICY "snapshots_select" ON public.snapshots
  FOR SELECT TO authenticated
  USING (
    business_id IN (
      SELECT business_id FROM public.business_members WHERE user_id = auth.uid()
    )
  );

-- Members with owner/admin role can create
CREATE POLICY "snapshots_insert" ON public.snapshots
  FOR INSERT TO authenticated
  WITH CHECK (
    business_id IN (
      SELECT business_id FROM public.business_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Owners can delete snapshots (except pre_restore ones, enforced in RPC)
CREATE POLICY "snapshots_delete" ON public.snapshots
  FOR DELETE TO authenticated
  USING (
    business_id IN (
      SELECT business_id FROM public.business_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- Snapshots are immutable
CREATE POLICY "snapshots_no_update" ON public.snapshots
  FOR UPDATE TO authenticated USING (false);

-- ─── 3. create_snapshot ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_snapshot(
  p_business_id uuid,
  p_label       text    DEFAULT NULL,
  p_type        text    DEFAULT 'manual'
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id             uuid;
  v_product_count  int;
  v_category_count int;
  v_coupon_count   int;
  v_data           jsonb;
BEGIN
  -- For manual snapshots, verify the caller is owner/admin
  IF p_type = 'manual' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.business_members
      WHERE user_id = auth.uid()
        AND business_id = p_business_id
        AND role IN ('owner', 'admin')
    ) THEN
      RAISE EXCEPTION 'Accès refusé';
    END IF;

    -- Rate limit: 20 manual snapshots per 60s per business
    IF NOT check_rate_limit('snapshot:' || p_business_id::text, 20, 60) THEN
      RAISE EXCEPTION 'Trop de snapshots — réessayez dans quelques secondes';
    END IF;
  END IF;

  -- Count items for the summary columns
  SELECT COUNT(*) INTO v_product_count
  FROM public.products WHERE business_id = p_business_id;

  SELECT COUNT(*) INTO v_category_count
  FROM public.categories WHERE business_id = p_business_id;

  SELECT COUNT(*) INTO v_coupon_count
  FROM public.coupons WHERE business_id = p_business_id;

  -- Build the full JSON snapshot
  SELECT jsonb_build_object(
    'products',
    COALESCE(
      (SELECT jsonb_agg(to_jsonb(p))
       FROM public.products p
       WHERE p.business_id = p_business_id),
      '[]'::jsonb
    ),
    'categories',
    COALESCE(
      (SELECT jsonb_agg(to_jsonb(c))
       FROM public.categories c
       WHERE c.business_id = p_business_id),
      '[]'::jsonb
    ),
    'coupons',
    COALESCE(
      (SELECT jsonb_agg(to_jsonb(cp))
       FROM public.coupons cp
       WHERE cp.business_id = p_business_id),
      '[]'::jsonb
    )
  ) INTO v_data;

  INSERT INTO public.snapshots
    (business_id, created_by, label, type, product_count, category_count, coupon_count, data)
  VALUES (
    p_business_id,
    CASE WHEN p_type = 'manual' THEN auth.uid() ELSE NULL END,
    COALESCE(p_label, 'Snapshot du ' || to_char(now(), 'DD/MM/YYYY à HH24:MI')),
    p_type,
    v_product_count,
    v_category_count,
    v_coupon_count,
    v_data
  )
  RETURNING id INTO v_id;

  -- Prune: keep the 50 most recent snapshots per business (excluding pre_restore)
  DELETE FROM public.snapshots
  WHERE business_id = p_business_id
    AND type != 'pre_restore'
    AND id NOT IN (
      SELECT id FROM public.snapshots
      WHERE business_id = p_business_id
        AND type != 'pre_restore'
      ORDER BY created_at DESC
      LIMIT 50
    );

  -- Log the action (only for manual snapshots)
  IF p_type = 'manual' THEN
    INSERT INTO public.activity_logs (business_id, user_id, action, metadata)
    VALUES (
      p_business_id,
      auth.uid(),
      'snapshot.created',
      jsonb_build_object(
        'snapshot_id',     v_id,
        'snapshot_label',  p_label,
        'product_count',   v_product_count,
        'category_count',  v_category_count,
        'coupon_count',    v_coupon_count
      )
    );
  END IF;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION create_snapshot(uuid, text, text) TO authenticated;

-- ─── 4. get_snapshots : lightweight list ──────────────────────────────────────

CREATE OR REPLACE FUNCTION get_snapshots(p_business_id uuid)
RETURNS TABLE (
  id              uuid,
  label           text,
  type            text,
  product_count   int,
  category_count  int,
  coupon_count    int,
  created_by_name text,
  created_at      timestamptz
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.business_members
    WHERE user_id = auth.uid() AND business_id = p_business_id
  ) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.label,
    s.type,
    s.product_count,
    s.category_count,
    s.coupon_count,
    u.full_name AS created_by_name,
    s.created_at
  FROM public.snapshots s
  LEFT JOIN public.users u ON u.id = s.created_by
  WHERE s.business_id = p_business_id
  ORDER BY s.created_at DESC
  LIMIT 100;
END;
$$;
GRANT EXECUTE ON FUNCTION get_snapshots(uuid) TO authenticated;

-- ─── 5. get_snapshot_data : fetch full JSON for preview/diff ──────────────────

CREATE OR REPLACE FUNCTION get_snapshot_data(p_snapshot_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_snapshot public.snapshots%ROWTYPE;
BEGIN
  SELECT * INTO v_snapshot FROM public.snapshots WHERE id = p_snapshot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Snapshot introuvable';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.business_members
    WHERE user_id = auth.uid() AND business_id = v_snapshot.business_id
  ) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  RETURN v_snapshot.data;
END;
$$;
GRANT EXECUTE ON FUNCTION get_snapshot_data(uuid) TO authenticated;

-- ─── 6. restore_snapshot ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION restore_snapshot(
  p_snapshot_id uuid,
  p_tables      text[] DEFAULT ARRAY['products', 'categories', 'coupons']
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_snapshot     public.snapshots%ROWTYPE;
  v_result       jsonb := '{}';
  v_safety_id    uuid;
  v_count        int;
  v_product      jsonb;
BEGIN
  SELECT * INTO v_snapshot FROM public.snapshots WHERE id = p_snapshot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Snapshot introuvable';
  END IF;

  -- Only owner/admin can restore
  IF NOT EXISTS (
    SELECT 1 FROM public.business_members
    WHERE user_id = auth.uid()
      AND business_id = v_snapshot.business_id
      AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  -- Rate limit: 5 restores per 10 min per business (heavy operation)
  IF NOT check_rate_limit('restore:' || v_snapshot.business_id::text, 5, 600) THEN
    RAISE EXCEPTION 'Trop de restaurations — réessayez dans 10 minutes';
  END IF;

  -- ── Safety snapshot before any changes ────────────────────────────────────
  INSERT INTO public.snapshots
    (business_id, created_by, label, type, product_count, category_count, coupon_count, data)
  SELECT
    v_snapshot.business_id,
    auth.uid(),
    'Avant restauration du ' || to_char(v_snapshot.created_at, 'DD/MM/YYYY HH24:MI'),
    'pre_restore',
    (SELECT COUNT(*) FROM public.products WHERE business_id = v_snapshot.business_id),
    (SELECT COUNT(*) FROM public.categories WHERE business_id = v_snapshot.business_id),
    (SELECT COUNT(*) FROM public.coupons WHERE business_id = v_snapshot.business_id),
    jsonb_build_object(
      'products',
      COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM public.products p WHERE p.business_id = v_snapshot.business_id), '[]'),
      'categories',
      COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM public.categories c WHERE c.business_id = v_snapshot.business_id), '[]'),
      'coupons',
      COALESCE((SELECT jsonb_agg(to_jsonb(cp)) FROM public.coupons cp WHERE cp.business_id = v_snapshot.business_id), '[]')
    )
  RETURNING id INTO v_safety_id;

  -- ── Restore products ───────────────────────────────────────────────────────
  IF 'products' = ANY(p_tables) AND jsonb_array_length(COALESCE(v_snapshot.data->'products', '[]')) > 0 THEN
    v_count := 0;
    FOR v_product IN SELECT * FROM jsonb_array_elements(v_snapshot.data->'products')
    LOOP
      UPDATE public.products SET
        name        = v_product->>'name',
        description = v_product->>'description',
        price       = (v_product->>'price')::numeric,
        image_url   = v_product->>'image_url',
        barcode     = v_product->>'barcode',
        sku         = v_product->>'sku',
        track_stock = (v_product->>'track_stock')::boolean,
        stock       = (v_product->>'stock')::numeric,
        unit        = v_product->>'unit',
        category_id = (v_product->>'category_id')::uuid,
        is_active   = (v_product->>'is_active')::boolean,
        updated_at  = now()
      WHERE id = (v_product->>'id')::uuid
        AND business_id = v_snapshot.business_id;

      IF FOUND THEN v_count := v_count + 1; END IF;
    END LOOP;
    v_result := v_result || jsonb_build_object('products_updated', v_count);
  END IF;

  -- ── Restore categories ────────────────────────────────────────────────────
  IF 'categories' = ANY(p_tables) AND jsonb_array_length(COALESCE(v_snapshot.data->'categories', '[]')) > 0 THEN
    INSERT INTO public.categories (id, business_id, name, color, icon, sort_order)
    SELECT
      (cat->>'id')::uuid,
      v_snapshot.business_id,
      cat->>'name',
      cat->>'color',
      cat->>'icon',
      (cat->>'sort_order')::int
    FROM jsonb_array_elements(v_snapshot.data->'categories') AS cat
    ON CONFLICT (id) DO UPDATE SET
      name       = EXCLUDED.name,
      color      = EXCLUDED.color,
      icon       = EXCLUDED.icon,
      sort_order = EXCLUDED.sort_order;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := v_result || jsonb_build_object('categories_restored', v_count);
  END IF;

  -- ── Restore coupons ───────────────────────────────────────────────────────
  IF 'coupons' = ANY(p_tables) AND jsonb_array_length(COALESCE(v_snapshot.data->'coupons', '[]')) > 0 THEN
    v_count := 0;
    FOR v_product IN SELECT * FROM jsonb_array_elements(v_snapshot.data->'coupons')
    LOOP
      UPDATE public.coupons SET
        is_active  = (v_product->>'is_active')::boolean,
        uses_count = (v_product->>'uses_count')::int,
        expires_at = NULLIF(v_product->>'expires_at', '')::timestamptz
      WHERE id = (v_product->>'id')::uuid
        AND business_id = v_snapshot.business_id;
      IF FOUND THEN v_count := v_count + 1; END IF;
    END LOOP;
    v_result := v_result || jsonb_build_object('coupons_updated', v_count);
  END IF;

  -- ── Audit log ─────────────────────────────────────────────────────────────
  INSERT INTO public.activity_logs (business_id, user_id, action, metadata)
  VALUES (
    v_snapshot.business_id,
    auth.uid(),
    'snapshot.restored',
    jsonb_build_object(
      'snapshot_id',       p_snapshot_id,
      'snapshot_label',    v_snapshot.label,
      'snapshot_created_at', v_snapshot.created_at,
      'tables_restored',   p_tables,
      'safety_snapshot_id', v_safety_id,
      'result',            v_result
    )
  );

  RETURN v_result || jsonb_build_object('safety_snapshot_id', v_safety_id);
END;
$$;
GRANT EXECUTE ON FUNCTION restore_snapshot(uuid, text[]) TO authenticated;

-- ─── 7. delete_snapshot ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION delete_snapshot(p_snapshot_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_snapshot public.snapshots%ROWTYPE;
BEGIN
  SELECT * INTO v_snapshot FROM public.snapshots WHERE id = p_snapshot_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Snapshot introuvable'; END IF;

  -- Only owner can delete
  IF NOT EXISTS (
    SELECT 1 FROM public.business_members
    WHERE user_id = auth.uid()
      AND business_id = v_snapshot.business_id
      AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Seul le propriétaire peut supprimer un snapshot';
  END IF;

  -- Protect pre_restore safety snapshots — must keep them for at least 24h
  IF v_snapshot.type = 'pre_restore' AND v_snapshot.created_at > now() - interval '24 hours' THEN
    RAISE EXCEPTION 'Le snapshot de sécurité ne peut pas être supprimé dans les 24h suivant une restauration';
  END IF;

  DELETE FROM public.snapshots WHERE id = p_snapshot_id;
END;
$$;
GRANT EXECUTE ON FUNCTION delete_snapshot(uuid) TO authenticated;

-- ─── 8. Auto-snapshot: called by pg_cron ─────────────────────────────────────

CREATE OR REPLACE FUNCTION auto_snapshot_all_businesses()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_biz record;
BEGIN
  FOR v_biz IN
    SELECT DISTINCT o.business_id
    FROM public.orders o
    WHERE o.created_at > now() - interval '25 hours'
    UNION
    SELECT DISTINCT se.business_id
    FROM public.stock_entries se
    WHERE se.created_at > now() - interval '25 hours'
  LOOP
    INSERT INTO public.snapshots
      (business_id, created_by, label, type, product_count, category_count, coupon_count, data)
    SELECT
      v_biz.business_id,
      NULL,
      'Snapshot auto — ' || to_char(now(), 'DD/MM/YYYY HH24:MI'),
      'auto',
      (SELECT COUNT(*) FROM public.products WHERE business_id = v_biz.business_id),
      (SELECT COUNT(*) FROM public.categories WHERE business_id = v_biz.business_id),
      (SELECT COUNT(*) FROM public.coupons WHERE business_id = v_biz.business_id),
      jsonb_build_object(
        'products',   COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM public.products p WHERE p.business_id = v_biz.business_id), '[]'),
        'categories', COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM public.categories c WHERE c.business_id = v_biz.business_id), '[]'),
        'coupons',    COALESCE((SELECT jsonb_agg(to_jsonb(cp)) FROM public.coupons cp WHERE cp.business_id = v_biz.business_id), '[]')
      );

    -- Prune auto snapshots: keep last 30 per business
    DELETE FROM public.snapshots
    WHERE business_id = v_biz.business_id
      AND type = 'auto'
      AND id NOT IN (
        SELECT id FROM public.snapshots
        WHERE business_id = v_biz.business_id AND type = 'auto'
        ORDER BY created_at DESC
        LIMIT 30
      );
  END LOOP;
END;
$$;

-- ─── 9. Schedule daily auto-snapshot at 02:00 UTC ────────────────────────────
-- Requires pg_cron extension (enabled on Supabase Pro+)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'elm-pos-daily-snapshot',
      '0 2 * * *',
      'SELECT public.auto_snapshot_all_businesses()'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_cron not available — auto-snapshots must be triggered from the app
  NULL;
END;
$$;
