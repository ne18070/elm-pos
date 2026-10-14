-- ============================================================================
-- Migration 158 : onglet « En ligne » de la page Commandes
--
-- Les commandes de la boutique (web + appli ELM Boutique, source = 'boutique')
-- étaient mêlées aux ventes de caisse sans aucun repère, et comptées comme
-- « Acomptes » (solde dû > 0) alors qu'il s'agit de commandes non encore
-- encaissées — comme les demandes WhatsApp, déjà exclues.
--
-- search_order_ids (chemin de recherche de getOrders, migration 124) :
--   - nouveau paramètre p_source pour filtrer l'onglet « En ligne » ;
--   - acomptes : exclut aussi source = 'boutique'.
-- ============================================================================

DROP FUNCTION IF EXISTS public.search_order_ids(
  uuid, text, text, boolean, timestamptz, timestamptz, uuid, timestamptz, int, int
);

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
  p_offset         int         DEFAULT 0,
  p_source         text        DEFAULT NULL
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
      AND (p_source        IS NULL OR o.source      = p_source)
      AND (p_cashier_id    IS NULL OR o.cashier_id  = p_cashier_id)
      AND (p_created_after IS NULL OR o.created_at >= p_created_after)
      AND (p_date_from     IS NULL OR o.created_at >= p_date_from)
      AND (p_date_to       IS NULL OR o.created_at <= p_date_to)
      AND (
            NOT p_acompte_only
            OR (o.balance_due > 0.005
                AND o.status NOT IN ('cancelled', 'refunded')
                AND o.source NOT IN ('whatsapp', 'boutique'))
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
  uuid, text, text, boolean, timestamptz, timestamptz, uuid, timestamptz, int, int, text
) TO authenticated, service_role;
