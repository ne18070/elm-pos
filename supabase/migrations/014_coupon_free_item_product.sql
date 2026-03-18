-- ============================================================
-- Migration 014 : Produit offert lié au coupon free_item
-- Permet de déduire le produit offert du stock automatiquement.
-- ============================================================

ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS free_item_product_id  UUID REFERENCES products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS free_item_quantity     NUMERIC(10,3) NOT NULL DEFAULT 1;
