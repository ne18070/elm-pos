-- Migration: 081_remove_caisse_duplicate.sql
-- Description: Remove legacy 'caisse' module alias — consolidated into 'pos'

-- 1. Migrate businesses that have 'caisse' but NOT 'pos' → replace with 'pos'
UPDATE public.businesses
SET features = array_replace(features, 'caisse', 'pos')
WHERE 'caisse' = ANY(features) AND NOT ('pos' = ANY(features));

-- 2. Remove 'caisse' from businesses that already have 'pos' (would become duplicate)
UPDATE public.businesses
SET features = array_remove(features, 'caisse')
WHERE 'caisse' = ANY(features);

-- 3. Remove 'caisse' from business_type_modules if it exists
DELETE FROM public.business_type_modules WHERE module_id = 'caisse';

-- 4. Delete the duplicate module row
DELETE FROM public.app_modules WHERE id = 'caisse';
