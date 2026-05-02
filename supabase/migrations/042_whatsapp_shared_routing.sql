-- Migration: 042_whatsapp_shared_routing.sql
-- Description: Support pour le routage de messages sur un numéro WhatsApp partagé

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- 1. Code de routage unique par business
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.businesses
ADD COLUMN IF NOT EXISTS whatsapp_routing_code TEXT UNIQUE;

-- Générer un code stable : 4 premiers chars du slug (ou UUID si slug null) + 4 premiers chars de l'UUID
-- COALESCE protège contre les public_slug NULL
UPDATE public.businesses
SET whatsapp_routing_code =
  UPPER(
    LEFT(REPLACE(COALESCE(public_slug, id::text), '-', ''), 4)
    || LEFT(REPLACE(id::text, '-', ''), 4)
  )
WHERE whatsapp_routing_code IS NULL;

-- ─────────────────────────────────────────────────────────────────
-- 2. Sessions de routage pour le numéro partagé ELM
--    Mémorise avec quel business chaque numéro client est en train de parler.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_shared_sessions (
  from_phone     TEXT PRIMARY KEY,
  business_id    UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  last_active_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour le nettoyage des vieilles sessions
CREATE INDEX IF NOT EXISTS idx_wa_shared_sessions_active
  ON public.whatsapp_shared_sessions(last_active_at);

-- RLS : table de routage interne, accessible uniquement en service role (webhook) ou superadmin
ALTER TABLE public.whatsapp_shared_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_shared_sessions_superadmin" ON public.whatsapp_shared_sessions;
CREATE POLICY "wa_shared_sessions_superadmin" ON public.whatsapp_shared_sessions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true)
  );

-- ─────────────────────────────────────────────────────────────────
-- 3. Nettoyage automatique des sessions inactives (> 30 jours)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cleanup_whatsapp_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.whatsapp_shared_sessions
  WHERE last_active_at < NOW() - INTERVAL '30 days';
END;
$$;

-- Planifier via pg_cron si disponible (sinon configurer manuellement)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('cleanup-whatsapp-sessions');
    PERFORM cron.schedule(
      'cleanup-whatsapp-sessions',
      '0 4 * * *',  -- Tous les jours à 4h UTC
      'SELECT public.cleanup_whatsapp_sessions()'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron non disponible: configurer manuellement cleanup_whatsapp_sessions()';
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 4. Extension de whatsapp_configs : opt-in numéro partagé ELM
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.whatsapp_configs
ADD COLUMN IF NOT EXISTS use_shared_number BOOLEAN DEFAULT false;

COMMIT;
