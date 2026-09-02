-- Migration 101 : RPC pour vider le journal comptable d'un commerce
--
-- La politique je_delete restreint la suppression client aux écritures
-- source='manual'. Pour une remise à zéro complète (reprise d'historique), on
-- passe par une fonction SECURITY DEFINER réservée au propriétaire / admin.
--
-- Un import de reprise charge des dizaines de milliers d'écritures (× ~3 en
-- journal_lines). Une suppression en un bloc dépasse le statement_timeout.
-- Ici :
--   · index (business_id, entry_date) — sinon chaque filtre business_id scanne
--     toute la table ;
--   · statement_timeout dédié à la fonction ;
--   · suppression par tranches de 5 000 écritures (les lignes cascadent) ;
--   · plafond p_limit par appel → le client rappelle en boucle jusqu'à 0, pour
--     ne jamais dépendre d'une limite de passerelle sur une requête unique.

CREATE INDEX IF NOT EXISTS idx_journal_entries_biz_date
  ON public.journal_entries (business_id, entry_date);

DROP FUNCTION IF EXISTS public.clear_journal(uuid);

CREATE OR REPLACE FUNCTION public.clear_journal(
  p_business_id uuid,
  p_limit       integer DEFAULT 20000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '300000'
AS $$
DECLARE
  v_total   integer := 0;
  v_deleted integer;
BEGIN
  IF p_business_id IS DISTINCT FROM get_user_business_id() THEN
    RAISE EXCEPTION 'Non autorisé pour cet établissement';
  END IF;
  IF get_user_role() NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Réservé au propriétaire ou administrateur';
  END IF;

  LOOP
    EXIT WHEN v_total >= p_limit;
    DELETE FROM public.journal_entries
    WHERE id IN (
      SELECT id FROM public.journal_entries
      WHERE business_id = p_business_id
      LIMIT LEAST(5000, p_limit - v_total)
    );
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_total := v_total + v_deleted;
    EXIT WHEN v_deleted = 0;
  END LOOP;

  RETURN v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_journal(uuid, integer) TO authenticated, service_role;
