-- ============================================================================
-- Migration 152 : Module Marketing — Publicités Meta (Facebook/Instagram) + TikTok
--
-- Le commerçant connecte SON propre compte publicitaire via OAuth et reste
-- facturé directement par Meta/TikTok. elm-pos ne fait que créer et suivre les
-- campagnes : aucune avance de trésorerie, aucun budget mutualisé.
--
-- SÉCURITÉ DES TOKENS — pourquoi pas le pattern `intouch_configs_public`
-- Ce dépôt protège déjà une clé d'API via une vue (003_sales_and_payments.sql
-- :681) mais cette vue n'a ni RLS ni clause WHERE : elle s'exécute avec les
-- droits du propriétaire, donc elle expose les lignes de TOUS les business.
-- On ne reproduit pas ça ici. À la place : GRANT SELECT au niveau colonne sur
-- la table elle-même, excluant access_token/refresh_token. La RLS continue de
-- s'appliquer (isolation par business), et une lecture des colonnes de token
-- par un client `authenticated` échoue au niveau du moteur, pas d'une
-- convention de code. Conséquence à connaître : `select('*')` sur
-- ad_platform_connections renvoie « permission denied » côté client — c'est
-- voulu, la couche service énumère les colonnes explicitement.
--
-- ÉCRITURES : aucune n'est autorisée au client. Créer une campagne, c'est
-- déclencher une dépense publicitaire — tout passe par les Edge Functions en
-- service_role, qui détiennent les tokens et vérifient le rôle admin/owner.
--
-- DEVISES SANS DÉCIMALES : le XOF n'a pas de centimes. Chez Meta un budget de
-- 5000 vaut 5 000 FCFA, alors que le même 5000 en EUR vaut 50,00 €. Les
-- montants sont donc stockés en unité mineure + devise, et la conversion est
-- faite au seul endroit qui connaît la devise du compte connecté
-- (supabase/functions/_shared/money.ts).
-- ============================================================================

-- ─── Connexions aux plateformes ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ad_platform_connections (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id            UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  platform               TEXT NOT NULL CHECK (platform IN ('meta', 'tiktok')),

  -- Secrets : jamais accordés au rôle `authenticated` (voir GRANT plus bas)
  access_token           TEXT,
  refresh_token          TEXT,
  token_expires_at       TIMESTAMPTZ,

  -- Compte publicitaire retenu (act_… chez Meta, advertiser_id chez TikTok)
  external_account_id    TEXT,
  external_account_name  TEXT,
  currency               TEXT NOT NULL DEFAULT 'XOF',
  -- Plancher de budget quotidien imposé par la plateforme, dans la devise du
  -- compte : lu à la connexion plutôt que codé en dur, car il dépend du pays,
  -- de la devise et de l'objectif.
  min_daily_budget_minor BIGINT,

  -- Identités de diffusion. Meta publie sous une Page (et éventuellement un
  -- compte Instagram) ; TikTok impose sa propre « identité », créée une fois
  -- par annonceur et réutilisée à chaque annonce.
  page_id                TEXT,
  page_name              TEXT,
  instagram_actor_id     TEXT,
  pixel_id               TEXT,
  identity_id            TEXT,

  -- Comptes/Pages disponibles renvoyés par la plateforme, pour l'écran de
  -- sélection quand le commerçant en possède plusieurs.
  available_accounts     JSONB,

  status                 TEXT NOT NULL DEFAULT 'needs_account_selection'
                         CHECK (status IN ('needs_account_selection', 'connected', 'token_expired', 'disconnected')),
  last_error             TEXT,
  last_checked_at        TIMESTAMPTZ,
  connected_by           UUID REFERENCES users(id),
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (business_id, platform)
);

CREATE INDEX IF NOT EXISTS ad_platform_connections_biz_idx
  ON ad_platform_connections(business_id, platform);
CREATE INDEX IF NOT EXISTS ad_platform_connections_active_idx
  ON ad_platform_connections(status) WHERE status = 'connected';

-- ─── Campagnes ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ad_campaigns (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id          UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- Une soumission de l'assistant = un groupe = une ligne par plateforme.
  -- L'UI regroupe là-dessus pour présenter « une publicité » et non deux.
  campaign_group_id    UUID NOT NULL,
  connection_id        UUID REFERENCES ad_platform_connections(id) ON DELETE SET NULL,
  platform             TEXT NOT NULL CHECK (platform IN ('meta', 'tiktok')),

  name                 TEXT NOT NULL,
  objective            TEXT NOT NULL CHECK (objective IN ('ventes', 'visibilite', 'messages')),
  status               TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'publishing', 'active', 'paused', 'ended', 'failed', 'rejected')),

  product_id           UUID REFERENCES products(id) ON DELETE SET NULL,
  daily_budget_minor   BIGINT NOT NULL CHECK (daily_budget_minor > 0),
  currency             TEXT NOT NULL DEFAULT 'XOF',
  start_date           DATE NOT NULL,
  end_date             DATE,
  landing_url          TEXT,

  targeting            JSONB NOT NULL DEFAULT '{}'::jsonb,
  creative             JSONB NOT NULL DEFAULT '{}'::jsonb,

  external_campaign_id TEXT,
  external_adset_id    TEXT,
  external_ad_id       TEXT,

  error_message        TEXT,
  last_synced_at       TIMESTAMPTZ,
  created_by           UUID REFERENCES users(id),
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT ad_campaigns_dates CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS ad_campaigns_biz_idx     ON ad_campaigns(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ad_campaigns_group_idx   ON ad_campaigns(campaign_group_id);
CREATE INDEX IF NOT EXISTS ad_campaigns_sync_idx    ON ad_campaigns(status, last_synced_at)
  WHERE status IN ('active', 'paused', 'publishing');

-- ─── Métriques quotidiennes ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ad_metrics_daily (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  campaign_id  UUID NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  date         DATE NOT NULL,
  impressions  BIGINT NOT NULL DEFAULT 0,
  reach        BIGINT NOT NULL DEFAULT 0,
  clicks       BIGINT NOT NULL DEFAULT 0,
  conversions  BIGINT NOT NULL DEFAULT 0,
  spend_minor  BIGINT NOT NULL DEFAULT 0,
  currency     TEXT NOT NULL DEFAULT 'XOF',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (campaign_id, date)
);

CREATE INDEX IF NOT EXISTS ad_metrics_daily_biz_idx ON ad_metrics_daily(business_id, date DESC);

-- ─── États OAuth (anti-CSRF) ─────────────────────────────────────────────────
-- Sans ce jeton à usage unique, un tiers pourrait faire aboutir un callback et
-- rattacher SON compte publicitaire au business d'un autre — ou l'inverse.
-- Jamais exposée au client : RLS active et aucune policy = tout refusé sauf
-- service_role.

CREATE TABLE IF NOT EXISTS ad_oauth_states (
  state         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL CHECK (platform IN ('meta', 'tiktok')),
  return_origin TEXT NOT NULL,
  consumed_at   TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ad_oauth_states_expiry_idx ON ad_oauth_states(expires_at);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE ad_platform_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_campaigns            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_metrics_daily        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_oauth_states         ENABLE ROW LEVEL SECURITY;

-- Lecture seule pour manager/admin/owner. Aucune policy d'écriture : les
-- mutations passent exclusivement par les Edge Functions (service_role).

DROP POLICY IF EXISTS "ad_platform_connections_select" ON ad_platform_connections;
CREATE POLICY "ad_platform_connections_select" ON ad_platform_connections FOR SELECT TO authenticated
  USING (
    business_id = get_user_business_id()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND (role IN ('manager', 'admin', 'owner') OR is_superadmin = true)
    )
  );

DROP POLICY IF EXISTS "ad_campaigns_select" ON ad_campaigns;
CREATE POLICY "ad_campaigns_select" ON ad_campaigns FOR SELECT TO authenticated
  USING (
    business_id = get_user_business_id()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND (role IN ('manager', 'admin', 'owner') OR is_superadmin = true)
    )
  );

DROP POLICY IF EXISTS "ad_metrics_daily_select" ON ad_metrics_daily;
CREATE POLICY "ad_metrics_daily_select" ON ad_metrics_daily FOR SELECT TO authenticated
  USING (
    business_id = get_user_business_id()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND (role IN ('manager', 'admin', 'owner') OR is_superadmin = true)
    )
  );

-- ─── Triggers ────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS ad_platform_connections_updated_at ON ad_platform_connections;
CREATE TRIGGER ad_platform_connections_updated_at BEFORE UPDATE ON ad_platform_connections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS ad_campaigns_updated_at ON ad_campaigns;
CREATE TRIGGER ad_campaigns_updated_at BEFORE UPDATE ON ad_campaigns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS ad_metrics_daily_updated_at ON ad_metrics_daily;
CREATE TRIGGER ad_metrics_daily_updated_at BEFORE UPDATE ON ad_metrics_daily
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── GRANTs ──────────────────────────────────────────────────────────────────

-- Connexions : SELECT colonne par colonne, access_token et refresh_token
-- volontairement absents de la liste.
REVOKE ALL ON TABLE public.ad_platform_connections FROM authenticated, anon;
GRANT SELECT (
  id, business_id, platform,
  external_account_id, external_account_name, currency, min_daily_budget_minor,
  page_id, page_name, instagram_actor_id, pixel_id, identity_id,
  available_accounts, status, last_error, last_checked_at,
  connected_by, created_at, updated_at
) ON TABLE public.ad_platform_connections TO authenticated;

REVOKE ALL ON TABLE public.ad_campaigns     FROM authenticated, anon;
REVOKE ALL ON TABLE public.ad_metrics_daily FROM authenticated, anon;
REVOKE ALL ON TABLE public.ad_oauth_states  FROM authenticated, anon;

GRANT SELECT ON TABLE public.ad_campaigns     TO authenticated;
GRANT SELECT ON TABLE public.ad_metrics_daily TO authenticated;

GRANT ALL ON TABLE public.ad_platform_connections TO service_role;
GRANT ALL ON TABLE public.ad_campaigns            TO service_role;
GRANT ALL ON TABLE public.ad_metrics_daily        TO service_role;
GRANT ALL ON TABLE public.ad_oauth_states         TO service_role;

GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
