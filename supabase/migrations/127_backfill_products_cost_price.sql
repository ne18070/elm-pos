-- ============================================================================
-- Migration 127 : backfill du prix d'achat sur les produits existants
--
-- La migration 126 a ajouté products.cost_price, mais elle ne le renseigne
-- qu'au PROCHAIN approvisionnement (add_stock_entry / receive_purchase_order).
-- Les produits déjà en stock avant cette migration ont donc cost_price = NULL
-- et n'affichent aucun prix d'achat, alors que l'historique existe déjà dans
-- stock_entries.cost_per_unit. On reporte ici le DERNIER coût unitaire connu
-- de chaque produit, sans écraser une valeur déjà présente (saisie manuelle
-- ou déjà backfillée par un appro récent).
-- ============================================================================

WITH latest_cost AS (
  SELECT DISTINCT ON (product_id)
    product_id, cost_per_unit
  FROM public.stock_entries
  WHERE cost_per_unit IS NOT NULL
  ORDER BY product_id, created_at DESC, id DESC
)
UPDATE public.products p
SET cost_price = lc.cost_per_unit,
    updated_at = NOW()
FROM latest_cost lc
WHERE p.id = lc.product_id
  AND p.cost_price IS NULL;
