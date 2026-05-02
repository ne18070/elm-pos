-- Migration: 041_monitoring_advanced.sql
-- Alertes intelligentes, santé DB, funnel business.
-- Toutes les opérations sont idempotentes (IF NOT EXISTS / CREATE OR REPLACE).

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- 1. Table de configuration des règles d'alerte
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.monitoring_alert_rules (
  code          TEXT PRIMARY KEY,           -- 'signup_zero', 'error_rate', etc.
  label         TEXT NOT NULL,
  threshold     NUMERIC NOT NULL,           -- valeur seuil (%, ms, minutes...)
  window_min    INTEGER NOT NULL DEFAULT 30, -- fenêtre d'observation (minutes)
  cooldown_min  INTEGER NOT NULL DEFAULT 30, -- temps minimum entre deux alertes
  channels      TEXT[] DEFAULT ARRAY['whatsapp'],
  is_active     BOOLEAN DEFAULT TRUE,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Règles par défaut (production-safe)
INSERT INTO public.monitoring_alert_rules (code, label, threshold, window_min, cooldown_min, channels) VALUES
  ('signup_zero',         'Aucun signup depuis X min',          30,   30,  30, ARRAY['whatsapp']),
  ('error_rate',          'Taux erreur frontend > seuil %',      5,   10,  20, ARRAY['whatsapp', 'slack']),
  ('checkout_failure',    'Paiement KO',                         1,    5,  10, ARRAY['whatsapp']),
  ('db_latency',          'Latence SQL moyenne > seuil ms',    2000,  10,  30, ARRAY['slack']),
  ('auth_spike',          'Échecs login > seuil en X min',      10,   10,  30, ARRAY['whatsapp', 'slack']),
  ('trial_conversion_low','Conversion trial < seuil %',         50,   60, 120, ARRAY['whatsapp'])
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────
-- 2. Journal des alertes envoyées (anti-spam + audit)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.monitoring_alert_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code   TEXT NOT NULL,
  value       NUMERIC,
  channels    TEXT[],
  fired_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_log_rule_fired ON public.monitoring_alert_log(rule_code, fired_at DESC);

-- ─────────────────────────────────────────────────────────────────
-- 3. Fonction d'évaluation des alertes (appelée par pg_cron)
--    Insère dans monitoring_vitals avec level='critical' →
--    le Database Webhook configuré via le Dashboard envoie l'alerte.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.evaluate_monitoring_alerts()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule          RECORD;
  v_value         NUMERIC;
  v_last_fired    TIMESTAMPTZ;
  v_error_count   INT;
  v_total_count   INT;
  v_auth_failures INT;
  v_last_signup   TIMESTAMPTZ;
  v_avg_latency   NUMERIC;

  -- Convertir trial_conversion : nécessite analytics_events
  v_provisioned   INT;
  v_started       INT;
BEGIN

  -- ── 1. Error rate (10 dernières minutes) ──────────────────────
  SELECT
    COUNT(*) FILTER (WHERE level = 'error'),
    COUNT(*)
  INTO v_error_count, v_total_count
  FROM public.monitoring_vitals
  WHERE created_at > NOW() - INTERVAL '10 minutes';

  IF v_total_count > 10 THEN
    v_value := ROUND((v_error_count::NUMERIC / v_total_count) * 100, 1);
    SELECT fired_at INTO v_last_fired FROM public.monitoring_alert_log
    WHERE rule_code = 'error_rate' ORDER BY fired_at DESC LIMIT 1;

    IF v_value > 5 AND (v_last_fired IS NULL OR v_last_fired < NOW() - INTERVAL '20 minutes') THEN
      INSERT INTO public.monitoring_vitals (level, category, message, context)
      VALUES ('critical', 'alert', 'Taux d''erreur critique : ' || v_value || '%',
              jsonb_build_object('rule', 'error_rate', 'value', v_value, 'threshold', 5));
      INSERT INTO public.monitoring_alert_log (rule_code, value, channels) VALUES ('error_rate', v_value, ARRAY['whatsapp','slack']);
    END IF;
  END IF;

  -- ── 2. Signup zéro (heures actives Dakar : 7h–22h) ────────────
  IF EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Africa/Dakar') BETWEEN 7 AND 22 THEN
    SELECT MAX(created_at) INTO v_last_signup
    FROM public.analytics_events
    WHERE event_name IN ('signup_started', 'onboarding_started');

    IF v_last_signup IS NULL OR v_last_signup < NOW() - INTERVAL '30 minutes' THEN
      v_value := COALESCE(EXTRACT(EPOCH FROM (NOW() - v_last_signup)) / 60, 999);

      SELECT fired_at INTO v_last_fired FROM public.monitoring_alert_log
      WHERE rule_code = 'signup_zero' ORDER BY fired_at DESC LIMIT 1;

      IF v_last_fired IS NULL OR v_last_fired < NOW() - INTERVAL '30 minutes' THEN
        INSERT INTO public.monitoring_vitals (level, category, message, context)
        VALUES ('critical', 'alert', 'Aucun signup depuis ' || ROUND(v_value) || ' minutes',
                jsonb_build_object('rule', 'signup_zero', 'value', v_value));
        INSERT INTO public.monitoring_alert_log (rule_code, value, channels) VALUES ('signup_zero', v_value, ARRAY['whatsapp']);
      END IF;
    END IF;
  END IF;

  -- ── 3. Latence SQL haute (10 dernières minutes) ───────────────
  SELECT AVG(latency_ms) INTO v_avg_latency
  FROM public.monitoring_vitals
  WHERE category = 'sql' AND level = 'perf' AND created_at > NOW() - INTERVAL '10 minutes';

  IF v_avg_latency > 2000 THEN
    SELECT fired_at INTO v_last_fired FROM public.monitoring_alert_log
    WHERE rule_code = 'db_latency' ORDER BY fired_at DESC LIMIT 1;

    IF v_last_fired IS NULL OR v_last_fired < NOW() - INTERVAL '30 minutes' THEN
      INSERT INTO public.monitoring_vitals (level, category, message, context)
      VALUES ('critical', 'alert', 'Latence SQL élevée : ' || ROUND(v_avg_latency) || 'ms',
              jsonb_build_object('rule', 'db_latency', 'value', v_avg_latency, 'threshold', 2000));
      INSERT INTO public.monitoring_alert_log (rule_code, value, channels) VALUES ('db_latency', v_avg_latency, ARRAY['slack']);
    END IF;
  END IF;

  -- ── 4. Spike échecs d'authentification ────────────────────────
  SELECT COUNT(*) INTO v_auth_failures
  FROM public.monitoring_vitals
  WHERE category = 'auth' AND level = 'error' AND created_at > NOW() - INTERVAL '10 minutes';

  IF v_auth_failures >= 10 THEN
    SELECT fired_at INTO v_last_fired FROM public.monitoring_alert_log
    WHERE rule_code = 'auth_spike' ORDER BY fired_at DESC LIMIT 1;

    IF v_last_fired IS NULL OR v_last_fired < NOW() - INTERVAL '30 minutes' THEN
      INSERT INTO public.monitoring_vitals (level, category, message, context)
      VALUES ('critical', 'alert', 'Spike d''échecs login : ' || v_auth_failures || ' en 10 min',
              jsonb_build_object('rule', 'auth_spike', 'value', v_auth_failures));
      INSERT INTO public.monitoring_alert_log (rule_code, value, channels) VALUES ('auth_spike', v_auth_failures, ARRAY['whatsapp','slack']);
    END IF;
  END IF;

  -- ── 5. Conversion trial basse (dernière heure) ────────────────
  SELECT COUNT(*) INTO v_provisioned
  FROM public.analytics_events
  WHERE event_name = 'provisioning_success' AND created_at > NOW() - INTERVAL '1 hour';

  SELECT COUNT(*) INTO v_started
  FROM public.analytics_events
  WHERE event_name IN ('signup_started', 'onboarding_started') AND created_at > NOW() - INTERVAL '1 hour';

  IF v_started >= 5 THEN
    v_value := ROUND((v_provisioned::NUMERIC / v_started) * 100, 1);
    IF v_value < 50 THEN
      SELECT fired_at INTO v_last_fired FROM public.monitoring_alert_log
      WHERE rule_code = 'trial_conversion_low' ORDER BY fired_at DESC LIMIT 1;

      IF v_last_fired IS NULL OR v_last_fired < NOW() - INTERVAL '2 hours' THEN
        INSERT INTO public.monitoring_vitals (level, category, message, context)
        VALUES ('critical', 'alert', 'Conversion trial basse : ' || v_value || '% (sur ' || v_started || ' essais)',
                jsonb_build_object('rule', 'trial_conversion_low', 'value', v_value, 'signups', v_started));
        INSERT INTO public.monitoring_alert_log (rule_code, value, channels) VALUES ('trial_conversion_low', v_value, ARRAY['whatsapp']);
      END IF;
    END IF;
  END IF;

END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 4. Santé de la base de données (pour CTO dashboard)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_db_health()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_connections INT;
  v_blocked     INT;
  v_db_size     BIGINT;
  v_cache_hit   NUMERIC;
BEGIN
  SELECT COUNT(*) INTO v_connections
  FROM pg_stat_activity WHERE state = 'active' AND pid <> pg_backend_pid();

  SELECT COUNT(*) INTO v_blocked
  FROM pg_locks WHERE NOT granted;

  SELECT pg_database_size(current_database()) INTO v_db_size;

  SELECT ROUND(
    SUM(heap_blks_hit)::NUMERIC /
    NULLIF(SUM(heap_blks_hit) + SUM(heap_blks_read), 0) * 100, 1
  ) INTO v_cache_hit
  FROM pg_statio_user_tables;

  RETURN jsonb_build_object(
    'active_connections', v_connections,
    'blocked_locks',      v_blocked,
    'db_size_bytes',      v_db_size,
    'cache_hit_ratio',    COALESCE(v_cache_hit, 0)
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 5. Top slow queries via pg_stat_statements (si activé)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_slow_queries(p_limit INT DEFAULT 10)
RETURNS TABLE (
  query_text     TEXT,
  calls          BIGINT,
  mean_ms        NUMERIC,
  total_ms       NUMERIC,
  rows_returned  BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- pg_stat_statements doit être activé : Dashboard > Extensions > pg_stat_statements
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') THEN
    RETURN QUERY
    SELECT
      LEFT(query, 200)            AS query_text,
      calls,
      ROUND(mean_exec_time::NUMERIC, 1) AS mean_ms,
      ROUND(total_exec_time::NUMERIC, 1) AS total_ms,
      rows                        AS rows_returned
    FROM pg_stat_statements
    WHERE query NOT LIKE '%pg_stat%'
      AND query NOT LIKE '%monitoring_vitals%'
    ORDER BY mean_exec_time DESC
    LIMIT p_limit;
  END IF;
  -- Si pg_stat_statements non activé : retourne vide sans erreur
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 6. RLS pour les nouvelles tables
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.monitoring_alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_alert_log   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alert_rules_superadmin" ON public.monitoring_alert_rules;
CREATE POLICY "alert_rules_superadmin" ON public.monitoring_alert_rules
  FOR ALL USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true));

DROP POLICY IF EXISTS "alert_log_superadmin" ON public.monitoring_alert_log;
CREATE POLICY "alert_log_superadmin" ON public.monitoring_alert_log
  FOR ALL USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true));

-- ─────────────────────────────────────────────────────────────────
-- 7. Planifier l'évaluation des alertes toutes les 5 minutes
-- ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('evaluate-monitoring-alerts');
    PERFORM cron.schedule('evaluate-monitoring-alerts', '*/5 * * * *',
      'SELECT public.evaluate_monitoring_alerts()');
    RAISE NOTICE 'pg_cron: evaluate-monitoring-alerts planifié toutes les 5 minutes';
  ELSE
    RAISE NOTICE 'pg_cron non activé. Activer via Dashboard Supabase > Extensions, puis relancer.';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Erreur cron: %. Configurer manuellement.', SQLERRM;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- Note de déploiement :
-- Mettre à jour le Database Webhook (configuré en 040) pour inclure
-- level IN ('error', 'critical') — ou créer un second webhook filtré.
-- La fonction monitoring-alert/index.ts gère déjà les deux niveaux.
-- ─────────────────────────────────────────────────────────────────

COMMIT;
