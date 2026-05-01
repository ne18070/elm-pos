-- ============================================================
-- Rapport quotidien des prestations (pg_cron + pg_net)
-- Envoi chaque matin à 09h00 UTC à tous les propriétaires
-- ============================================================
--
-- AVANT D'EXÉCUTER :
--   1. Déployez la function : supabase functions deploy daily-services-report
--   2. Ajoutez le secret CRON_SECRET dans :
--      Supabase Dashboard → Project Settings → Edge Functions → Secrets
--   3. Remplacez dans ce fichier :
--      • YOUR_PROJECT_REF  → le ref de votre projet (ex: abcxyzabcxyz)
--      • YOUR_CRON_SECRET  → la valeur choisie pour CRON_SECRET
-- ============================================================

-- Extensions (déjà activées en général sur Supabase Cloud)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Supprimer le job existant si on réexécute la migration
SELECT cron.unschedule('daily-services-report')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'daily-services-report'
);

-- Planifier à 09:00 UTC tous les jours
SELECT cron.schedule(
  'daily-services-report',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/daily-services-report',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer YOUR_CRON_SECRET'
    ),
    body    := '{}'::jsonb
  );
  $$
);
