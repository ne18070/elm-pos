-- ============================================================================
-- Migration 120 : article offert — choix de l'unité (par unité de vente ou
-- par sous-unité, p.ex. « à la tablette » plutôt qu'« au carton »)
--
-- Un coupon free_item sur un produit vendu au carton offrait forcément 1
-- carton entier (= tout le prix du carton). On permet désormais d'offrir une
-- fraction de l'unité de stock :
--
--   free_item_unit_label        : libellé de l'unité offerte (« tablette »,
--                                 « sachet »…). NULL → unité du produit.
--   free_item_stock_consumption : nb d'unités de STOCK consommées par unité
--                                 offerte. 1 = on offre à l'unité de vente ;
--                                 1/24 ≈ 0.041667 = on offre à la pièce quand
--                                 un carton en contient 24.
--
-- Quantité de stock déduite = free_item_quantity × free_item_stock_consumption
-- Prix unitaire affiché       = prix produit × free_item_stock_consumption
-- ============================================================================

ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS free_item_unit_label TEXT,
  ADD COLUMN IF NOT EXISTS free_item_stock_consumption NUMERIC(12,6) NOT NULL DEFAULT 1;

ALTER TABLE public.coupons
  DROP CONSTRAINT IF EXISTS coupons_free_item_consumption_pos;
ALTER TABLE public.coupons
  ADD CONSTRAINT coupons_free_item_consumption_pos
  CHECK (free_item_stock_consumption > 0) NOT VALID;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.coupons TO authenticated;
GRANT ALL ON TABLE public.coupons TO service_role;
