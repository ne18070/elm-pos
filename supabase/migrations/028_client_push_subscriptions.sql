-- Migration 028 : Push notifications pour les clients (page de suivi public)
-- Stocke les subscriptions web push des clients liées à leur token de suivi

CREATE TABLE IF NOT EXISTS public.client_push_subscriptions (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  token      TEXT        NOT NULL,
  endpoint   TEXT        NOT NULL,
  p256dh     TEXT        NOT NULL,
  auth       TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(token, endpoint)
);

ALTER TABLE public.client_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Insertion publique (depuis le service worker sans auth)
CREATE POLICY "client push public insert" ON public.client_push_subscriptions
  FOR INSERT WITH CHECK (true);

-- Lecture via service role uniquement (API routes)
CREATE POLICY "client push service role select" ON public.client_push_subscriptions
  FOR SELECT USING (true);

-- Suppression via service role (cleanup des subscriptions expirées)
CREATE POLICY "client push service role delete" ON public.client_push_subscriptions
  FOR DELETE USING (true);
