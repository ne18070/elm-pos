-- Migration 097 : Intégration PayDunya SOFTPAY (Orange Money & Wave Sénégal)
-- Table de config singleton (clés API PayDunya, éditable par le superadmin
-- uniquement, jamais exposées côté client) + table d'audit des transactions.
-- Expose des endpoints /api/payments/paydunya/* réutilisables par n'importe
-- quelle application externe (pas seulement l'app ELM), protégés par une clé
-- API dédiée (proxy_api_key) distincte du système api_keys existant (celui-ci
-- est lié à un business ELM + à la validité de son abonnement, ce qui n'a pas
-- de sens pour un simple proxy de paiement).

CREATE TABLE IF NOT EXISTS public.paydunya_settings (
  id                 int PRIMARY KEY DEFAULT 1,
  mode               text NOT NULL DEFAULT 'test' CHECK (mode IN ('test', 'live')),
  -- PayDunya n'a qu'UNE Clé Principale (Master Key) par application, partagée
  -- entre Test et Production — seules Publique/Privée/Token sont dupliquées
  -- par mode. `mode` détermine quel jeu Test/Production est utilisé par les
  -- appels réels, sans avoir à ressaisir l'autre jeu à chaque bascule.
  master_key         text,
  test_private_key   text,
  test_public_key    text,
  test_token         text,
  live_private_key   text,
  live_public_key    text,
  live_token         text,
  store_name         text NOT NULL DEFAULT 'ELM',
  store_logo_url     text,
  store_website_url  text,
  proxy_api_key      text,   -- clé partagée avec les applications externes appelantes
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT paydunya_settings_singleton CHECK (id = 1)
);

INSERT INTO public.paydunya_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.paydunya_transactions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_reference     text,             -- référence fournie par l'application appelante
  invoice_token          text UNIQUE,
  provider               text NOT NULL,    -- 'orange-money-senegal' | 'wave-senegal'
  amount                 numeric(14,2) NOT NULL,
  currency               text NOT NULL DEFAULT 'XOF',
  customer_name          text,
  customer_email         text,
  customer_phone         text,
  status                 text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','failed','cancelled')),
  redirect_url           text,             -- URL de paiement renvoyée à l'appelant (QR/Wave)
  raw_initiate_response  jsonb,
  raw_confirm_response   jsonb,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS paydunya_transactions_ref_idx    ON public.paydunya_transactions (external_reference);
CREATE INDEX IF NOT EXISTS paydunya_transactions_status_idx ON public.paydunya_transactions (status);

-- ── RLS ────────────────────────────────────────────────────────────────────────
-- paydunya_transactions n'a aucune policy pour authenticated/anon : seules les
-- routes serveur (client service_role, qui contourne la RLS) y accèdent.
ALTER TABLE public.paydunya_settings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paydunya_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "paydunya_settings: superadmin all" ON public.paydunya_settings
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true));

-- ── Grants ─────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.paydunya_settings     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.paydunya_transactions TO authenticated;
GRANT ALL ON TABLE public.paydunya_settings     TO service_role;
GRANT ALL ON TABLE public.paydunya_transactions TO service_role;
