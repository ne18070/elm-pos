-- Migration 106 : pagination serveur du journal + détection de doublons
--
-- getJournalEntries chargeait toute la période avec lines:journal_lines(*)
-- embarqué → sur un journal volumineux (import de reprise), dépassement du
-- statement_timeout du rôle authenticated (57014), même sur 2 mois.
--
-- Deux RPC SECURITY DEFINER (statement_timeout dédié, RLS remplacée par le
-- filtre business_id = get_user_business_id()) :
--   · journal_page  : une page d'écritures (avec leurs lignes) + total ;
--   · journal_dupes : les groupes de doublons (réf + date + montant + libellé)
--     sous forme de tableaux d'ids — payload minime.

CREATE OR REPLACE FUNCTION public.journal_page(
  p_from   date DEFAULT NULL,
  p_to     date DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_limit  integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '60000'
AS $$
  WITH biz AS (SELECT get_user_business_id() AS id),
  flt AS (
    SELECT je.id, je.entry_date, je.reference, je.description, je.source, je.created_at
    FROM journal_entries je, biz
    WHERE je.business_id = biz.id
      AND (p_from   IS NULL OR je.entry_date >= p_from)
      AND (p_to     IS NULL OR je.entry_date <= p_to)
      AND (p_source IS NULL OR je.source = p_source)
  ),
  pg AS (
    SELECT * FROM flt
    ORDER BY entry_date DESC, id DESC
    LIMIT GREATEST(p_limit, 0) OFFSET GREATEST(p_offset, 0)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM flt),
    'rows', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', pg.id,
          'entry_date', pg.entry_date,
          'reference', pg.reference,
          'description', pg.description,
          'source', pg.source,
          'created_at', pg.created_at,
          'lines', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', jl.id, 'account_code', jl.account_code, 'account_name', jl.account_name,
              'debit', jl.debit, 'credit', jl.credit))
            FROM journal_lines jl WHERE jl.entry_id = pg.id
          ), '[]'::jsonb)
        )
        ORDER BY pg.entry_date DESC, pg.id DESC
      )
      FROM pg
    ), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.journal_dupes(
  p_from date DEFAULT NULL,
  p_to   date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120000'
AS $$
  WITH biz AS (SELECT get_user_business_id() AS id),
  ln AS (
    SELECT jl.entry_id, round(COALESCE(SUM(jl.debit), 0), 2) AS amount
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.entry_id, biz
    WHERE je.business_id = biz.id
      AND (p_from IS NULL OR je.entry_date >= p_from)
      AND (p_to   IS NULL OR je.entry_date <= p_to)
    GROUP BY jl.entry_id
  ),
  grp AS (
    SELECT array_agg(je.id ORDER BY je.id) AS ids
    FROM journal_entries je
    JOIN ln ON ln.entry_id = je.id, biz
    WHERE je.business_id = biz.id
      AND COALESCE(je.reference, '') <> ''
    GROUP BY lower(je.reference), je.entry_date, ln.amount, lower(COALESCE(je.description, ''))
    HAVING count(*) > 1
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(ids)), '[]'::jsonb) FROM grp;
$$;

GRANT EXECUTE ON FUNCTION public.journal_page(date, date, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.journal_dupes(date, date) TO authenticated, service_role;
