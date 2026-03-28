-- ─── Hotel accounting integration ────────────────────────────────────────────
--
-- 1. Add 'hotel' to journal_entries.source check constraint
-- 2. Ensure account 706 (Prestations hébergement) exists

-- Safely update the source check constraint
DO $$
BEGIN
  ALTER TABLE public.journal_entries
    DROP CONSTRAINT IF EXISTS journal_entries_source_check;
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_source_check
  CHECK (source IN ('manual', 'order', 'stock', 'refund', 'adjustment', 'hotel'));

-- Account 706 — Prestations hébergement (SYSCOHADA class 7)
INSERT INTO public.accounts (code, name, class, nature, balance_type, is_default, is_active)
SELECT '706', 'Prestations hébergement', 7, 'produit', 'credit', true, true
WHERE NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '706');
