-- Migration 102 : tenir la montée en charge du journal (import de reprise)
--
-- Un import ligne à ligne peut porter journal_entries à plusieurs dizaines de
-- milliers de lignes et journal_lines à plus de 100 000. Deux requêtes chaudes
-- n'étaient pas outillées pour ce volume :
--   · get_trial_balance / getJournalEntries : filtre business_id + plage de
--     dates → besoin d'un index composite (business_id, entry_date).
--   · get_trial_balance agrège tout le journal d'une période : on lui accorde
--     un statement_timeout dédié.

CREATE INDEX IF NOT EXISTS idx_journal_entries_biz_date
  ON public.journal_entries (business_id, entry_date);

-- Redéfinition à l'identique de la version 005 + SET statement_timeout dédié.
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
