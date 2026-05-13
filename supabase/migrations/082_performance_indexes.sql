-- ============================================================
-- Migration 082 : Indexes de performance + nettoyage activity_logs
-- Contexte : alerte Supabase Disk IO Budget > 100 %
--
-- Analyse pg_stat_statements (repport.csv) :
--   • 57 % du temps DB → realtime.list_changes (WAL Realtime, non modifiable ici)
--   • 10 % → monitoring_vitals INSERT à 276 ms/appel (table bloat, cleanup requis)
--   •  1.4 % → service_orders sans index sur status (index advisor l'indique)
--   Reste : requêtes catalogue dashboard Supabase (inévitables)
-- ============================================================

-- ─── 1. journal_lines : index sur la clé étrangère entry_id ──────────────────
-- PostgreSQL ne crée pas d'index automatiquement sur les colonnes FK.
-- Chaque appel à get_trial_balance() fait un seq scan de toute la table
-- journal_lines pour chaque ligne de journal_entries trouvée.
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry
  ON public.journal_lines (entry_id);

-- ─── 2. journal_lines : index couvrant pour la balance des comptes ────────────
-- get_trial_balance() filtre par account_code et agrège debit/credit.
-- Un index couvrant évite les accès à la table principale.
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry_account
  ON public.journal_lines (entry_id, account_code);

-- ─── 3. service_orders : index sur status ────────────────────────────────────
-- Flaggé par le Supabase Index Advisor (pg_stat_statements) :
--   "CREATE INDEX ON public.service_orders USING btree (status)"
-- Filtre status = 'open' | 'pending' | ... utilisé dans la liste des bons de travail.
CREATE INDEX IF NOT EXISTS idx_service_orders_status
  ON public.service_orders (business_id, status);

-- ─── 4. activity_logs : fonction de nettoyage (SECURITY DEFINER) ─────────────
-- La politique RLS "activity_logs_no_delete" interdit DELETE pour tous les rôles
-- authentifiés. Une fonction SECURITY DEFINER s'exécute en tant que son créateur
-- (superuser Supabase) et contourne RLS — c'est le seul moyen propre de purger.
CREATE OR REPLACE FUNCTION public.cleanup_activity_logs(p_keep_days INTEGER DEFAULT 90)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.activity_logs
  WHERE created_at < NOW() - (p_keep_days || ' days')::INTERVAL;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- Restreindre l'exécution aux superadmins uniquement
REVOKE ALL ON FUNCTION public.cleanup_activity_logs(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_activity_logs(INTEGER) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.cleanup_activity_logs(INTEGER) TO service_role;

-- ─── 5. Réduire le WAL Realtime : retirer REPLICA IDENTITY FULL ──────────────
-- whatsapp_messages : le client souscrit uniquement aux INSERT.
--   Pour les INSERT, la ligne complète est toujours disponible (WAL standard).
--   REPLICA IDENTITY FULL était requis pour les filtres sur UPDATE/DELETE,
--   mais ces events ne sont pas utilisés → WAL double inutilement.
ALTER TABLE public.whatsapp_messages    REPLICA IDENTITY DEFAULT;

-- service_order_events : même raisonnement (public tracking = INSERT only).
ALTER TABLE public.service_order_events REPLICA IDENTITY DEFAULT;

-- ─── 6. Planifier le nettoyage mensuel via pg_cron ────────────────────────────
-- Mensuel (1er du mois à 2h UTC) plutôt que quotidien pour limiter les pics d'IO.
-- 90 jours de rétention : suffisant pour l'audit et les exports comptables.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('cleanup-activity-logs');
    PERFORM cron.schedule(
      'cleanup-activity-logs',
      '0 2 1 * *',
      'SELECT public.cleanup_activity_logs(90)'
    );
    RAISE NOTICE 'pg_cron: cleanup-activity-logs planifié le 1er de chaque mois à 2h UTC';
  ELSE
    RAISE NOTICE 'pg_cron non activé — exécuter SELECT public.cleanup_activity_logs(90) manuellement.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Impossible de planifier le cron: %. Configurer manuellement.', SQLERRM;
END $$;
