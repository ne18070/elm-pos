-- ============================================================
-- Migration 011 : Unités de stock configurables par business
-- ============================================================

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS stock_units JSONB NOT NULL
  DEFAULT '["pièce","kg","g","litre","cl","carton","sac","sachet","boîte","paquet","lot"]';
