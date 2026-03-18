-- ============================================================
-- Migration 010 : Module Approvisionnement
-- ============================================================

CREATE TABLE IF NOT EXISTS stock_entries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  -- Quantité en unités de base ajoutée au stock (ex: 1000 pour 1000 kg)
  quantity        NUMERIC(10,3) NOT NULL CHECK (quantity > 0),
  -- Détail du conditionnement (ex: 20 sacs × 50 kg)
  packaging_qty   INTEGER,
  packaging_size  NUMERIC(10,3),
  packaging_unit  TEXT,               -- ex: "sac", "carton", "colis"
  -- Infos achat
  supplier        TEXT,
  cost_per_unit   NUMERIC(12,2),      -- coût par unité de base
  notes           TEXT,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_entries_business  ON stock_entries(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_entries_product   ON stock_entries(product_id);

ALTER TABLE stock_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_entries_select" ON stock_entries FOR SELECT
  USING (business_id = get_user_business_id());

CREATE POLICY "stock_entries_insert" ON stock_entries FOR INSERT
  WITH CHECK (
    business_id = get_user_business_id()
    AND get_user_role() IN ('owner', 'admin')
  );

-- ─── RPC : enregistrer un approvisionnement (atomique) ───────────────────────

CREATE OR REPLACE FUNCTION add_stock_entry(
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
BEGIN
  -- Vérifier que le produit appartient bien au business
  IF NOT EXISTS (
    SELECT 1 FROM products WHERE id = p_product_id AND business_id = p_business_id
  ) THEN
    RAISE EXCEPTION 'Produit introuvable';
  END IF;

  -- Enregistrer l'entrée de stock
  INSERT INTO stock_entries (
    business_id, product_id, quantity,
    packaging_qty, packaging_size, packaging_unit,
    supplier, cost_per_unit, notes, created_by
  )
  VALUES (
    p_business_id, p_product_id, p_quantity,
    p_packaging_qty, p_packaging_size, p_packaging_unit,
    p_supplier, p_cost_per_unit, p_notes, p_created_by
  );

  -- Incrémenter le stock du produit
  UPDATE products
  SET stock      = COALESCE(stock, 0) + p_quantity,
      updated_at = NOW()
  WHERE id = p_product_id;
END;
$$;
