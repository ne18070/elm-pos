-- ─── Business features (optional modules per business) ───────────────────────
--
-- Stores a list of enabled optional feature keys, e.g. ['pos', 'delivery'].
-- Non-hotel businesses always have POS available (checked client-side by type).
-- Hotel businesses show POS only if 'pos' is in this array.

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS features text[] NOT NULL DEFAULT '{}';
