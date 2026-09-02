-- Migration 103 : RPC d'insertion en masse dans le journal comptable
--
-- L'import de reprise (ancien système) inséré côté client via PostgREST
-- ligne à ligne : chaque ligne de journal_lines déclenche la sous-requête RLS
-- jl_insert (EXISTS sur journal_entries). Sur 100 000+ lignes → dépassement du
-- statement_timeout du rôle authenticated.
--
-- Ici : une seule requête ensembliste par lot, en SECURITY DEFINER (RLS
-- contournée, contrôle d'accès explicite), statement_timeout levé.
--
-- Le client fournit un `sid` DÉTERMINISTE par écriture (hash des champs stables
-- + rang de la ligne parmi ses identiques). ON CONFLICT DO NOTHING sur l'index
-- unique je_biz_source_uidx → ré-importer les mêmes fichiers n'ajoute rien.
-- Renvoie le nombre d'écritures RÉELLEMENT insérées lors de l'appel.
--
-- Format p_entries (jsonb array) :
--   [{ "sid": "<uuid>", "entry_date": "YYYY-MM-DD", "reference": "…"|null,
--      "description": "…", "source": "order|stock|adjustment|manual|…",
--      "lines": [{ "account_code":"571","account_name":"Caisse",
--                  "debit":1000,"credit":0 }, …] }, …]

CREATE OR REPLACE FUNCTION public.import_journal_entries(
  p_business_id uuid,
  p_entries     jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '600000'
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_business_id IS DISTINCT FROM get_user_business_id() THEN
    RAISE EXCEPTION 'Non autorisé pour cet établissement';
  END IF;
  IF get_user_role() NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Réservé au propriétaire ou administrateur';
  END IF;

  IF p_entries IS NULL OR jsonb_typeof(p_entries) <> 'array' THEN
    RETURN 0;
  END IF;

  WITH ins AS (
    INSERT INTO public.journal_entries
      (business_id, entry_date, reference, description, source, source_id)
    SELECT
      p_business_id,
      (e->>'entry_date')::date,
      NULLIF(e->>'reference', ''),
      COALESCE(e->>'description', ''),
      e->>'source',
      (e->>'sid')::uuid
    FROM jsonb_array_elements(p_entries) AS e
    ON CONFLICT (business_id, source, source_id) WHERE source_id IS NOT NULL DO NOTHING
    RETURNING id, source_id
  ),
  lines_written AS (
    INSERT INTO public.journal_lines
      (entry_id, account_code, account_name, debit, credit)
    SELECT
      ins.id,
      l->>'account_code',
      COALESCE(l->>'account_name', ''),
      COALESCE((l->>'debit')::numeric, 0),
      COALESCE((l->>'credit')::numeric, 0)
    FROM ins
    JOIN jsonb_array_elements(p_entries) AS e ON (e->>'sid')::uuid = ins.source_id
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(e->'lines', '[]'::jsonb)) AS l
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM ins;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.import_journal_entries(uuid, jsonb) TO authenticated, service_role;
