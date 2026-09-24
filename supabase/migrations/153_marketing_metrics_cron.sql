-- ============================================================
-- Synchronisation quotidienne des résultats publicitaires (pg_cron + pg_net)
-- Tire les métriques Meta/TikTok dans ad_metrics_daily chaque matin.
-- ============================================================
--
-- AVANT D'EXÉCUTER :
--   1. Déployez la function :
--        supabase functions deploy marketing-sync-metrics
--      Sa vérification de JWT est déjà désactivée dans supabase/config.toml :
--      le cron présente CRON_SECRET, qui n'est pas un JWT, et serait rejeté
--      avant même d'atteindre le code. L'appel utilisateur reste protégé, la
--      function validant elle-même le JWT quand l'en-tête n'est pas le secret.
--   2. Remplacez YOUR_CRON_SECRET par le CRON_SECRET déjà configuré sur le
--      projet (celui de daily-services-report — les secrets Edge Functions sont
--      partagés, il n'y a rien de nouveau à créer), au moment de coller ce
--      script dans le SQL editor et non dans le fichier versionné : pg_cron
--      stocke déjà la commande en clair dans cron.job, inutile de l'ajouter à
--      l'historique git par-dessus.
--
-- Une seule passe par jour suffit : la veille est alors consolidée côté
-- plateforme. Pour la fraîcheur en cours de journée, l'écran Marketing déclenche
-- la même function à la demande pour un seul business (bouton « Actualiser »),
-- ce qui évite de solliciter l'API pour tous les comptes en permanence.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Enveloppé : certains environnements (local, self-hosted) n'ont pas pg_cron,
-- la migration ne doit pas échouer pour autant.
DO $cron$
BEGIN
  PERFORM cron.unschedule('marketing-sync-metrics')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'marketing-sync-metrics');

  PERFORM cron.schedule(
    'marketing-sync-metrics',
    '0 5 * * *',
    $job$
    SELECT net.http_post(
      url     := 'https://lreadzxyenzqhcycyaru.supabase.co/functions/v1/marketing-sync-metrics',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer YOUR_CRON_SECRET'
      ),
      body    := '{}'::jsonb
    );
    $job$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron indisponible, planification ignorée : %', SQLERRM;
END
$cron$;
