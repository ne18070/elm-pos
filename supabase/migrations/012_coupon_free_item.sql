-- ============================================================
-- Migration 012 : Coupon type "article offert" (free_item)
-- ============================================================

-- 1. Supprimer les anciennes contraintes
ALTER TABLE coupons DROP CONSTRAINT IF EXISTS coupons_type_check;
ALTER TABLE coupons DROP CONSTRAINT IF EXISTS coupons_value_check;

-- 2. Ajouter les nouveaux champs
ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS min_quantity     INTEGER,   -- qté minimum de produits dans le panier
  ADD COLUMN IF NOT EXISTS free_item_label  TEXT;      -- description de l'article offert (ex: "1 bouteille")

-- 3. Recréer les contraintes avec le nouveau type
ALTER TABLE coupons
  ADD CONSTRAINT coupons_type_check
    CHECK (type IN ('percentage', 'fixed', 'free_item'));

-- Pour free_item : value = 0 est autorisé (pas de remise monétaire)
ALTER TABLE coupons
  ADD CONSTRAINT coupons_value_check
    CHECK (
      (type IN ('percentage', 'fixed') AND value > 0)
      OR
      (type = 'free_item' AND value >= 0)
    );
