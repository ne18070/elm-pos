-- Migration 105 : index de tri pour la liste du journal (gros volumes)
--
-- getJournalEntries feuillette journal_entries par .range() en triant sur
-- (entry_date desc, id desc). Sans index composite couvrant business_id +
-- entry_date + id, chaque page refait un tri complet de la période → sur une
-- année d'import de reprise (dizaines de milliers d'écritures) la requête
-- dépasse le statement_timeout du rôle authenticated (erreur 57014).

CREATE INDEX IF NOT EXISTS idx_journal_entries_biz_date_id
  ON public.journal_entries (business_id, entry_date DESC, id DESC);

-- Filtre par source parfois utilisé conjointement.
CREATE INDEX IF NOT EXISTS idx_journal_entries_biz_source_date
  ON public.journal_entries (business_id, source, entry_date DESC);

-- Résolution de l'embed lines:journal_lines(*) — garantie si la 082 manque.
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry
  ON public.journal_lines (entry_id);

-- get_trial_balance : re-défini à l'identique de la 102 (timeout dédié) — au cas
-- où la 102 n'aurait pas été appliquée.
CREATE OR REPLACE FUNCTION get_trial_balance(
  p_business_id UUID,
  p_date_from   DATE DEFAULT NULL,
  p_date_to     DATE DEFAULT NULL
)
RETURNS TABLE (
  account_code TEXT,
  account_name TEXT,
  class_num    SMALLINT,
  nature       TEXT,
  balance_type TEXT,
  total_debit  NUMERIC,
  total_credit NUMERIC,
  balance      NUMERIC
)
SECURITY DEFINER LANGUAGE sql
SET statement_timeout = '120000'
AS $$
  SELECT
    jl.account_code::TEXT,
    jl.account_name,
    (LEFT(jl.account_code, 1))::SMALLINT                             AS class_num,
    COALESCE(a.nature,
      CASE LEFT(jl.account_code, 1)
        WHEN '1' THEN 'passif'  WHEN '2' THEN 'actif'
        WHEN '3' THEN 'actif'   WHEN '4' THEN 'passif'
        WHEN '5' THEN 'actif'   WHEN '6' THEN 'charge'
        WHEN '7' THEN 'produit' ELSE 'actif'
      END)                                                           AS nature,
    COALESCE(a.balance_type,
      CASE LEFT(jl.account_code, 1)
        WHEN '1' THEN 'credit'  WHEN '4' THEN 'credit'
        WHEN '7' THEN 'credit'  ELSE 'debit'
      END)                                                           AS balance_type,
    SUM(jl.debit)                                                    AS total_debit,
    SUM(jl.credit)                                                   AS total_credit,
    SUM(jl.debit) - SUM(jl.credit)                                   AS balance
  FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.entry_id
  LEFT JOIN accounts a
    ON a.code = jl.account_code
    AND (a.business_id = p_business_id OR a.business_id IS NULL)
  WHERE je.business_id = p_business_id
    AND (p_date_from IS NULL OR je.entry_date >= p_date_from)
    AND (p_date_to   IS NULL OR je.entry_date <= p_date_to)
  GROUP BY jl.account_code, jl.account_name, 3, 4, 5
  ORDER BY jl.account_code;
$$;
