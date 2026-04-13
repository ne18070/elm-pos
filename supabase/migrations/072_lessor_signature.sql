-- ============================================================
-- 072 — Signature du loueur sur les contrats
-- ============================================================

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS lessor_signature_image text;
