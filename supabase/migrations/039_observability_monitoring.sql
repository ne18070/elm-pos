-- Migration: 039_observability_monitoring.sql
-- Description: Infrastructure pour le monitoring technique (erreurs, perf, vitals)

BEGIN;

-- 1. Table de logs techniques (Sépare les logs métiers des logs techniques)
CREATE TABLE IF NOT EXISTS public.monitoring_vitals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  business_id     UUID REFERENCES public.businesses(id) ON DELETE SET NULL,
  level           TEXT NOT NULL CHECK (level IN ('error', 'warn', 'info', 'perf')),
  category        TEXT NOT NULL, -- 'auth', 'api', 'js', 'sql', 'ux'
  message         TEXT NOT NULL,
  context         JSONB DEFAULT '{}',
  latency_ms      INTEGER,
  user_agent      TEXT,
  url             TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour la lecture rapide (Dashboard backoffice)
CREATE INDEX IF NOT EXISTS idx_vitals_created_at ON public.monitoring_vitals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vitals_level      ON public.monitoring_vitals(level);
CREATE INDEX IF NOT EXISTS idx_vitals_category   ON public.monitoring_vitals(category);
-- Index composite pour les requêtes filtrées par level + date (dashboard)
CREATE INDEX IF NOT EXISTS idx_vitals_level_cat  ON public.monitoring_vitals(level, category, created_at DESC);

-- 2. RLS : Sécurité maximale
ALTER TABLE public.monitoring_vitals ENABLE ROW LEVEL SECURITY;

-- BUGFIX : l'ancienne policy "auth.uid() = user_id" rejetait tous les inserts avec
-- user_id IS NULL (q.ts, erreurs système). Nouveau comportement :
-- tout utilisateur authentifié peut insérer avec son propre user_id ou null.
DROP POLICY IF EXISTS "vitals_insert_policy" ON public.monitoring_vitals;
CREATE POLICY "vitals_insert_policy" ON public.monitoring_vitals
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND (user_id IS NULL OR user_id = auth.uid())
  );

-- Seul le superadmin peut lire les logs (cross-tenant read interdit)
DROP POLICY IF EXISTS "vitals_select_admin_policy" ON public.monitoring_vitals;
CREATE POLICY "vitals_select_admin_policy" ON public.monitoring_vitals
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true)
  );

-- 3. Maintenance : Nettoyage automatique (7 jours)
CREATE OR REPLACE FUNCTION public.cleanup_monitoring_vitals()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.monitoring_vitals WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$;

-- 4. Planifier le nettoyage quotidien via pg_cron (si l'extension est activée)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Supprimer si déjà planifié pour éviter les doublons
    PERFORM cron.unschedule('cleanup-monitoring-vitals');
    PERFORM cron.schedule('cleanup-monitoring-vitals', '0 3 * * *', 'SELECT public.cleanup_monitoring_vitals()');
    RAISE NOTICE 'pg_cron: cleanup-monitoring-vitals planifié à 3h UTC';
  ELSE
    RAISE NOTICE 'pg_cron non activé. Activer via le Dashboard Supabase > Extensions, puis réexécuter.';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Impossible de planifier le cron: %. Configurer manuellement.', SQLERRM;
END $$;

COMMIT;
