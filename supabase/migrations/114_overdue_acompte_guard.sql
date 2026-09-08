-- ============================================================================
-- Migration 114 : garde-fou « acompte en souffrance »
--
-- La caisse doit refuser un NOUVEL acompte quand la partie concernée traîne
-- déjà un acompte impayé depuis plus de N jours (7 par défaut) :
--   · client      → rapproché par téléphone (chiffres seuls), sinon par nom
--                   exact (insensible casse/espaces) ;
--   · revendeur   → rapproché par reseller_id ;
--   · client d'un revendeur → rapproché par reseller_client_id.
--
-- SECURITY DEFINER : la policy orders_select ne laisse un caissier voir QUE ses
-- propres commandes ; le contrôle doit porter sur tout l'établissement, donc on
-- contourne la RLS après avoir vérifié l'appartenance via business_members.
--
-- « Acompte » = même définition que l'onglet Acompte (migration 112) :
--   balance_due > 0, statut hors (cancelled, refunded), source <> 'whatsapp'.
-- ============================================================================

DROP FUNCTION IF EXISTS public.overdue_acompte_for_customer(uuid, text, text, integer);

CREATE OR REPLACE FUNCTION public.overdue_acompte_for_customer(
  p_business_id        uuid,
  p_name               text    DEFAULT NULL,
  p_phone              text    DEFAULT NULL,
  p_reseller_id        uuid    DEFAULT NULL,
  p_reseller_client_id uuid    DEFAULT NULL,
  p_days               integer DEFAULT 7
)
RETURNS TABLE (
  id             uuid,
  created_at     timestamptz,
  balance_due    numeric,
  total          numeric,
  customer_name  text,
  customer_phone text,
  reseller_id    uuid,
  days_old       integer,
  matched_on     text   -- 'reseller' | 'reseller_client' | 'phone' | 'name'
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT
      NULLIF(regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'), '') AS phone_digits,
      NULLIF(lower(btrim(COALESCE(p_name, ''))), '')                   AS name_key
  )
  SELECT
    o.id,
    o.created_at,
    o.balance_due,
    o.total,
    o.customer_name,
    o.customer_phone,
    o.reseller_id,
    GREATEST(0, EXTRACT(DAY FROM (now() - o.created_at))::int) AS days_old,
    CASE
      WHEN p_reseller_id IS NOT NULL AND o.reseller_id = p_reseller_id                      THEN 'reseller'
      WHEN p_reseller_client_id IS NOT NULL AND o.reseller_client_id = p_reseller_client_id  THEN 'reseller_client'
      WHEN params.phone_digits IS NOT NULL
        AND regexp_replace(COALESCE(o.customer_phone, ''), '\D', '', 'g') = params.phone_digits THEN 'phone'
      ELSE 'name'
    END AS matched_on
  FROM public.orders o, params
  WHERE o.business_id = p_business_id
    AND EXISTS (
      SELECT 1 FROM public.business_members bm
      WHERE bm.business_id = p_business_id AND bm.user_id = auth.uid()
    )
    AND o.balance_due > 0.005
    AND o.status NOT IN ('cancelled', 'refunded')
    AND o.source <> 'whatsapp'
    AND o.created_at < now() - make_interval(days => GREATEST(COALESCE(p_days, 7), 0))
    AND (
      (params.phone_digits IS NOT NULL
        AND regexp_replace(COALESCE(o.customer_phone, ''), '\D', '', 'g') = params.phone_digits)
      OR
      (params.name_key IS NOT NULL
        AND lower(btrim(COALESCE(o.customer_name, ''))) = params.name_key)
      OR
      (p_reseller_id IS NOT NULL AND o.reseller_id = p_reseller_id)
      OR
      (p_reseller_client_id IS NOT NULL AND o.reseller_client_id = p_reseller_client_id)
    )
  ORDER BY o.created_at ASC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.overdue_acompte_for_customer(uuid, text, text, uuid, uuid, integer)
  TO authenticated, service_role;
