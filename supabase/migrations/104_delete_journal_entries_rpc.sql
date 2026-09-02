-- Migration 104 : suppression ciblée d'écritures du journal (ligne ou lot)
--
-- La politique je_delete ne laisse le client supprimer que source='manual'.
-- Pour le nettoyage d'un import de reprise (doublons réf.+date, écritures
-- order/stock/adjustment), on passe par une RPC SECURITY DEFINER réservée au
-- propriétaire / admin. journal_lines cascade.

CREATE OR REPLACE FUNCTION public.delete_journal_entries(
  p_business_id uuid,
  p_ids         uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120000'
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
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM public.journal_entries
  WHERE business_id = p_business_id
    AND id = ANY (p_ids);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_journal_entries(uuid, uuid[]) TO authenticated, service_role;
