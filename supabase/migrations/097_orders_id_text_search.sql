-- Migration 097 : colonne générée orders.id_text pour la recherche par ID
--
-- La recherche serveur sur /orders (services/supabase/orders.ts, getOrders)
-- doit matcher id/customer_name/customer_phone en un seul filtre .or(). `id`
-- est de type uuid — ilike exige du texte — mais PostgREST rejette le cast
-- explicite (`id::text.ilike...`) à l'intérieur de la grammaire or=(...) :
--   PGRST100 "unexpected \":\" expecting letter, digit, \"-\", ... "
-- confirmé en production. Une vraie colonne texte contourne le problème.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS id_text text GENERATED ALWAYS AS (id::text) STORED;

CREATE INDEX IF NOT EXISTS orders_id_text_idx ON public.orders (id_text);
