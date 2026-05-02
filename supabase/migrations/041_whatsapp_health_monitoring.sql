-- Migration: 041_whatsapp_health_monitoring.sql
-- Description: Suivi automatique de l'état de santé des connexions Meta WhatsApp

BEGIN;

-- 1. Champs de diagnostic sur whatsapp_configs
ALTER TABLE public.whatsapp_configs 
ADD COLUMN IF NOT EXISTS status_health TEXT DEFAULT 'unknown', -- 'healthy', 'token_expired', 'api_error', 'unknown'
ADD COLUMN IF NOT EXISTS last_health_check_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_api_error_message TEXT;

-- 2. Index pour filtrer rapidement au backoffice
CREATE INDEX IF NOT EXISTS idx_whatsapp_configs_health ON public.whatsapp_configs(status_health);

-- 3. Fonction RPC pour déclencher le check depuis le backoffice (si on ne veut pas attendre le cron)
CREATE OR REPLACE FUNCTION public.get_whatsapp_health_summary()
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM whatsapp_configs),
    'healthy', (SELECT count(*) FROM whatsapp_configs WHERE status_health = 'healthy'),
    'errors', (SELECT count(*) FROM whatsapp_configs WHERE status_health IN ('token_expired', 'api_error')),
    'unknown', (SELECT count(*) FROM whatsapp_configs WHERE status_health = 'unknown')
  ) INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
