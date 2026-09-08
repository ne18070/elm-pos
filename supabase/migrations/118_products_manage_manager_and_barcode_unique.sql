-- Migration 118 : produits — aligner la RLS sur les permissions + unicité du code-barres
--
-- A. RLS `products_manage` : la permission applicative `create_product` /
--    `edit_product` a pour rôles par défaut (manager, admin, owner) et l'UI
--    (page Produits : Nouveau / Modifier, sauvegarde des codes-barres) est
--    gardée par `can(...)`. Mais la RLS n'autorisait l'écriture qu'aux rôles
--    (admin, owner) → un manager (et le staff pour « Sauvegarder les codes »)
--    voyait les boutons mais toute écriture échouait en base.
--    On aligne la policy, comme la migration 111 l'a fait pour les coupons.
--
-- B. Code-barres non unique : `idx_products_barcode` est un index simple.
--    Deux produits actifs peuvent partager le même code-barres, ce qui casse
--    la recherche POS (`getProductByBarcode` renvoyait « introuvable » car la
--    requête `.single()` échoue sur plusieurs lignes). On dé-doublonne les
--    codes-barres en conflit (on garde le produit le plus récemment mis à jour,
--    on vide le code-barres des autres) puis on pose un index UNIQUE partiel.

-- ─── A. RLS ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "products_manage" ON public.products;
CREATE POLICY "products_manage" ON public.products FOR ALL
  USING (
    business_id = get_user_business_id()
    AND get_user_role() IN ('manager', 'admin', 'owner')
  )
  WITH CHECK (
    business_id = get_user_business_id()
    AND get_user_role() IN ('manager', 'admin', 'owner')
  );

-- ─── B. Unicité du code-barres (par business, produits actifs) ────────────────

-- B1. Dé-doublonnage : pour chaque (business_id, barcode) en conflit parmi les
--     produits actifs, on conserve la ligne la plus récemment mise à jour et on
--     vide le code-barres des autres.
DO $$
DECLARE
  v_cleared INTEGER;
BEGIN
  WITH ranked AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY business_id, barcode
             ORDER BY updated_at DESC, created_at DESC, id
           ) AS rn
    FROM public.products
    WHERE is_active = true
      AND barcode IS NOT NULL
      AND btrim(barcode) <> ''
  )
  UPDATE public.products p
  SET barcode = NULL,
      updated_at = NOW()
  FROM ranked r
  WHERE p.id = r.id
    AND r.rn > 1;

  GET DIAGNOSTICS v_cleared = ROW_COUNT;
  IF v_cleared > 0 THEN
    RAISE NOTICE 'Migration 118 : % code(s)-barres en doublon vidé(s).', v_cleared;
  END IF;
END $$;

-- B2. Normaliser les chaînes vides en NULL (cohérence avec l'app).
UPDATE public.products
SET barcode = NULL
WHERE barcode IS NOT NULL AND btrim(barcode) = '';

-- B3. Index UNIQUE partiel.
DROP INDEX IF EXISTS idx_products_barcode;
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode_unique
  ON public.products (business_id, barcode)
  WHERE barcode IS NOT NULL AND is_active;

-- Index de recherche conservé pour les lectures publiques (boutique) et le POS.
CREATE INDEX IF NOT EXISTS idx_products_barcode_lookup
  ON public.products (barcode)
  WHERE barcode IS NOT NULL;
