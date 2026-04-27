-- ============================================================
-- Migration 025 : Étendre les sources du journal comptable
-- Ajoute : voiture, honoraires, service_order, rental
-- ============================================================

-- 1. Mettre à jour le CHECK constraint sur journal_entries.source
DO $$
BEGIN
  ALTER TABLE public.journal_entries
    DROP CONSTRAINT IF EXISTS journal_entries_source_check;
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_source_check
  CHECK (source IN (
    'manual', 'order', 'stock', 'refund', 'adjustment',
    'hotel', 'voiture', 'honoraires', 'service_order', 'rental'
  ));

-- 2. Compte 467 — Autres débiteurs (pour propriétaires tiers de véhicules)
INSERT INTO public.accounts (code, name, class, nature, balance_type, is_default, is_active)
SELECT '467', 'Autres débiteurs divers', 4, 'actif', 'debit', true, true
WHERE NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '467' AND business_id IS NULL);

-- 3. Compte 7061 — Honoraires (prestations juridiques / cabinet)
INSERT INTO public.accounts (code, name, class, nature, balance_type, is_default, is_active)
SELECT '7061', 'Honoraires', 7, 'produit', 'credit', true, true
WHERE NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '7061' AND business_id IS NULL);

-- 4. Compte 7065 — Prestations de services (lavage, vidange, etc.)
INSERT INTO public.accounts (code, name, class, nature, balance_type, is_default, is_active)
SELECT '7065', 'Prestations de services', 7, 'produit', 'credit', true, true
WHERE NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '7065' AND business_id IS NULL);
