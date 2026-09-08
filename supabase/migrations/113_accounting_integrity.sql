-- ============================================================================
-- Migration 113 : intégrité comptable
--   1. Compte 647 « Impôts et taxes » (charge) — le template « Impôts / Taxes »
--      débitait 444 (dette fiscale jamais provisionnée) → la charge d'impôt ne
--      touchait jamais le compte de résultat. Il débite désormais 647.
--   2. get_trial_balance : 1 ligne PAR CODE (et non par code+intitulé) — deux
--      libellés pour un même code (« Caisse » vs « Caisse / Mobile ») scindaient
--      le compte et faussaient le bilan. Le rapprochement du plan comptable ne
--      retient qu'une ligne par code (le compte propre au commerce prime sur le
--      standard business_id IS NULL).
--   3. Trigger d'équilibre : toute écriture (jeu de journal_lines) doit vérifier
--      Σ débit = Σ crédit et compter au moins 2 lignes. DEFERRABLE INITIALLY
--      DEFERRED → contrôle au COMMIT (les insertions ligne à ligne restent
--      possibles). N'affecte que les écritures créées/modifiées après cette
--      migration ; l'historique déséquilibré éventuel n'est pas bloqué mais
--      reste visible via l'« écart de bilan » de l'UI.
--
-- NON couvert ici (décisions produit requises, à traiter séparément) :
--   · verrouillage d'exercice / date de clôture (blocage des écritures
--     antérieures à une date) ;
--   · numérotation séquentielle immuable des pièces (entry_no) ;
--   · restriction de lecture du journal aux rôles financiers.
-- ============================================================================

-- ─── 1. Compte 647 ──────────────────────────────────────────────────────────
INSERT INTO public.accounts (business_id, code, name, class, nature, balance_type, is_default, is_active)
SELECT NULL, '647', 'Impôts et taxes', 6, 'charge', 'debit', TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '647' AND business_id IS NULL);

-- ─── 2. get_trial_balance : agrégation par code ────────────────────────────
CREATE OR REPLACE FUNCTION public.get_trial_balance(
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
SECURITY DEFINER
SET search_path = public
LANGUAGE sql AS $$
  WITH acc AS (
    -- une seule définition par code : le compte propre au commerce l'emporte
    SELECT DISTINCT ON (a.code)
      a.code, a.name, a.class, a.nature, a.balance_type
    FROM accounts a
    WHERE a.business_id = p_business_id OR a.business_id IS NULL
    ORDER BY a.code, (a.business_id IS NOT NULL) DESC
  ),
  mv AS (
    SELECT
      jl.account_code,
      SUM(jl.debit)        AS total_debit,
      SUM(jl.credit)       AS total_credit,
      MIN(jl.account_name) AS fallback_name
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.entry_id
    WHERE je.business_id = p_business_id
      AND (p_date_from IS NULL OR je.entry_date >= p_date_from)
      AND (p_date_to   IS NULL OR je.entry_date <= p_date_to)
    GROUP BY jl.account_code
  )
  SELECT
    mv.account_code::TEXT,
    COALESCE(acc.name, mv.fallback_name)                          AS account_name,
    COALESCE(acc.class, LEFT(mv.account_code, 1)::SMALLINT)       AS class_num,
    COALESCE(acc.nature,
      CASE LEFT(mv.account_code, 1)
        WHEN '1' THEN 'passif'  WHEN '2' THEN 'actif'
        WHEN '3' THEN 'actif'   WHEN '4' THEN 'passif'
        WHEN '5' THEN 'actif'   WHEN '6' THEN 'charge'
        WHEN '7' THEN 'produit' ELSE 'actif'
      END)                                                        AS nature,
    COALESCE(acc.balance_type,
      CASE LEFT(mv.account_code, 1)
        WHEN '1' THEN 'credit'  WHEN '4' THEN 'credit'
        WHEN '7' THEN 'credit'  ELSE 'debit'
      END)                                                        AS balance_type,
    mv.total_debit,
    mv.total_credit,
    mv.total_debit - mv.total_credit                              AS balance
  FROM mv
  LEFT JOIN acc ON acc.code = mv.account_code
  ORDER BY mv.account_code;
$$;

GRANT EXECUTE ON FUNCTION public.get_trial_balance(UUID, DATE, DATE) TO authenticated, service_role;

-- ─── 3. Contrôle d'équilibre des écritures ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.je_assert_balanced()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_entry UUID := COALESCE(NEW.entry_id, OLD.entry_id);
  v_d NUMERIC;
  v_c NUMERIC;
  v_n INTEGER;
BEGIN
  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0), COUNT(*)
    INTO v_d, v_c, v_n
  FROM journal_lines
  WHERE entry_id = v_entry;

  -- écriture entièrement supprimée (cascade) → rien à contrôler
  IF v_n = 0 THEN
    RETURN NULL;
  END IF;

  IF v_n < 2 THEN
    RAISE EXCEPTION 'Écriture %: au moins 2 lignes mouvementées requises', v_entry;
  END IF;
  IF ABS(v_d - v_c) > 0.01 THEN
    RAISE EXCEPTION 'Écriture % déséquilibrée : débit % ≠ crédit %', v_entry, v_d, v_c;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS je_lines_balanced ON public.journal_lines;
CREATE CONSTRAINT TRIGGER je_lines_balanced
  AFTER INSERT OR UPDATE ON public.journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.je_assert_balanced();

GRANT EXECUTE ON FUNCTION public.je_assert_balanced() TO authenticated, service_role;

-- ─── 4. Nettoyage des écritures orphelines (sans ligne) ────────────────────
-- La politique je_delete ne laisse le client supprimer que source='manual'.
-- Si une synchro (hôtel / honoraires / prestations) a inséré une écriture puis
-- échoué sur ses lignes, l'écriture reste, sans ligne, définitivement « déjà
-- synchronisée ». Cette RPC (owner/admin) purge ces coquilles ; les synchros
-- l'appellent en préambule.
CREATE OR REPLACE FUNCTION public.delete_orphan_journal_entries(
  p_business_id uuid,
  p_source      text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF p_business_id IS DISTINCT FROM get_user_business_id() THEN
    RAISE EXCEPTION 'Non autorisé pour cet établissement';
  END IF;
  IF get_user_role() NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Réservé au propriétaire ou administrateur';
  END IF;

  DELETE FROM public.journal_entries je
  WHERE je.business_id = p_business_id
    AND (p_source IS NULL OR je.source = p_source)
    AND NOT EXISTS (SELECT 1 FROM public.journal_lines jl WHERE jl.entry_id = je.id);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_orphan_journal_entries(uuid, text) TO authenticated, service_role;
