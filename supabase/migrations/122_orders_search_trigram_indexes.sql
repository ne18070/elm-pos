-- Migration 122 : index trigram (pg_trgm) pour la recherche ILIKE sur orders
--
-- La recherche de la page Commandes (services/supabase/orders.ts, getOrders)
-- filtre via `id_text.ilike.%term%,customer_name.ilike.%term%,customer_phone.ilike.%term%`.
-- Un btree (comme `orders_id_text_idx`, migration 097) ne sert à rien pour un
-- pattern ILIKE à joker de tête ('%term%') : Postgres balaie alors tout
-- l'historique -> statement_timeout (57014), "Impossible de charger les
-- commandes" dès qu'on recherche sur un gros établissement.
--
-- Un index GIN trigram supporte nativement ILIKE '%term%' par index scan.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- CONSTRUCTION DE L'INDEX SUR UNE TABLE VOLUMINEUSE
--
-- La création elle-même dépasse le statement_timeout du SQL editor (57014).
-- Deux options :
--
--  A) SQL editor — lever le timeout pour la session AVANT de construire.
--     Exécuter ce script tel quel : le `SET statement_timeout = 0` en tête
--     s'applique au reste de la transaction. Verrou en écriture sur `orders`
--     pendant la construction (quelques secondes à quelques minutes) -> lancer
--     à un moment creux. Si l'editor impose un plafond côté passerelle malgré
--     le SET, passer à l'option B.
--
--  B) psql (recommandé si la table est vraiment grosse) — CONCURRENTLY, sans
--     verrou, HORS transaction, UNE instruction à la fois :
--       SET statement_timeout = 0;
--       CREATE EXTENSION IF NOT EXISTS pg_trgm;
--       CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_id_text_trgm_idx        ON public.orders USING gin (id_text gin_trgm_ops);
--       CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_customer_name_trgm_idx  ON public.orders USING gin (customer_name gin_trgm_ops);
--       CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_customer_phone_trgm_idx ON public.orders USING gin (customer_phone gin_trgm_ops);
--     (CONCURRENTLY interdit dans une transaction -> pas dans le SQL editor.)
-- ─────────────────────────────────────────────────────────────────────────────

SET statement_timeout = 0;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS orders_id_text_trgm_idx
  ON public.orders USING gin (id_text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS orders_customer_name_trgm_idx
  ON public.orders USING gin (customer_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS orders_customer_phone_trgm_idx
  ON public.orders USING gin (customer_phone gin_trgm_ops);

RESET statement_timeout;
