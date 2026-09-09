-- Migration 124 : RPC de recherche "fencée" pour l'onglet Commandes
--
-- Les migrations 122 (index trigram) et 123 (statistiques) réduisent le
-- risque, mais ne le garantissent pas : sur `... WHERE business_id = $1 AND
-- (id_text ILIKE $2 OR customer_name ILIKE $2 OR customer_phone ILIKE $2)
-- ORDER BY created_at DESC LIMIT $3`, le planificateur reste libre de choisir
-- un plan qui balaie par `created_at` (via l'index de tri) en filtrant ligne
-- à ligne plutôt que de partir des index trigram — correct pour un terme
-- fréquent (les correspondances arrivent tôt), catastrophique pour un terme
-- précis à deux mots ("amadou dabo") dont les rares correspondances peuvent
-- être n'importe où dans l'historique : confirmé en production, y compris
-- après ANALYZE.
--
-- `WITH ... AS MATERIALIZED` empêche Postgres de fusionner le ORDER BY/LIMIT
-- dans le scan filtré ("fence" d'optimisation) : l'ensemble des commandes
-- correspondant à la recherche est d'abord matérialisé (en s'appuyant sur les
-- index trigram, indépendamment de la sélectivité du terme), puis trié et
-- paginé. Ne renvoie que les `id` + le compte total (window function) — la
-- page hydrate ensuite les commandes complètes (jointures items/payments/
-- cashier/reseller) via un simple `.in('id', ids)`, requête triviale sur un
-- lot ≤ limit.
--
-- SECURITY INVOKER (défaut) : la RLS de `orders` s'applique normalement, à
-- l'identique du SELECT REST direct qu'elle remplace pour ce cas précis.

-- p_date_from/p_date_to attendent des bornes déjà résolues en UTC par
-- l'appelant TypeScript (même conversion que le chemin non-recherche de
-- getOrders : `new Date(`${date}T00:00:00`).toISOString()`) — pas de type
-- `date` ici, pour éviter de réinterpréter la date locale dans le fuseau de
-- la session Postgres (le même piège que documente déjà getOrders pour le
-- chemin sans recherche).
CREATE OR REPLACE FUNCTION public.search_order_ids(
  p_business_id    uuid,
  p_search         text,
  p_status         text        DEFAULT NULL,
  p_acompte_only   boolean     DEFAULT false,
  p_date_from      timestamptz DEFAULT NULL,
  p_date_to        timestamptz DEFAULT NULL,
  p_cashier_id     uuid        DEFAULT NULL,
  p_created_after  timestamptz DEFAULT NULL,
  p_limit          int         DEFAULT 50,
  p_offset         int         DEFAULT 0
)
RETURNS TABLE (id uuid, total_count bigint)
LANGUAGE sql
STABLE
AS $$
  WITH matches AS MATERIALIZED (
    SELECT o.id, o.created_at
    FROM public.orders o
    WHERE o.business_id = p_business_id
      AND (p_status        IS NULL OR o.status      = p_status)
      AND (p_cashier_id    IS NULL OR o.cashier_id  = p_cashier_id)
      AND (p_created_after IS NULL OR o.created_at >= p_created_after)
      AND (p_date_from     IS NULL OR o.created_at >= p_date_from)
      AND (p_date_to       IS NULL OR o.created_at <= p_date_to)
      AND (
            NOT p_acompte_only
            OR (o.balance_due > 0.005 AND o.status NOT IN ('cancelled', 'refunded') AND o.source <> 'whatsapp')
          )
      AND (
            o.id_text        ILIKE '%' || p_search || '%'
         OR o.customer_name  ILIKE '%' || p_search || '%'
         OR o.customer_phone ILIKE '%' || p_search || '%'
          )
  )
  SELECT m.id, count(*) OVER () AS total_count
  FROM matches m
  ORDER BY m.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION public.search_order_ids(
  uuid, text, text, boolean, timestamptz, timestamptz, uuid, timestamptz, int, int
) TO authenticated, service_role;
