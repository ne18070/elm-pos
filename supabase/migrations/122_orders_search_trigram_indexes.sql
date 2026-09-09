-- Migration 122 : index trigram (pg_trgm) pour la recherche ILIKE sur orders
--
-- La recherche de la page Commandes (services/supabase/orders.ts, getOrders)
-- filtre via `id_text.ilike.%term%,customer_name.ilike.%term%,customer_phone.ilike.%term%`.
-- Un btree (comme `orders_id_text_idx`, migration 097) ne sert à rien pour un
-- pattern ILIKE à joker de tête ('%term%') : Postgres doit alors scanner les
-- lignes en balayant l'historique (trié par created_at pour l'onglet "Toutes",
-- sans borne de date) jusqu'à réunir la page demandée. Sur un business avec
-- peu de commandes c'est indolore ; sur un gros historique, ce balayage peut
-- dépasser le statement_timeout et faire échouer le chargement — confirmé en
-- production : recherche rapide sur un petit établissement, "Impossible de
-- charger les commandes" sur un établissement avec beaucoup de factures.
--
-- Un index GIN trigram (pg_trgm) supporte nativement ILIKE '%term%' par index
-- scan, quelle que soit la position du terme dans la valeur.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS orders_id_text_trgm_idx
  ON public.orders USING gin (id_text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS orders_customer_name_trgm_idx
  ON public.orders USING gin (customer_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS orders_customer_phone_trgm_idx
  ON public.orders USING gin (customer_phone gin_trgm_ops);
