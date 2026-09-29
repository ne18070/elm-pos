-- ============================================================================
-- Migration 154 : Publication automatique sur Page Facebook et Instagram
--
-- Prolonge le module Marketing (152) : la même connexion Meta sert désormais à
-- publier le catalogue et le menu du jour, sans coût pour le commerçant et donc
-- sans compte publicitaire ni moyen de paiement à configurer.
--
-- JETON DE PAGE : publier sur une Page n'utilise PAS le jeton de l'utilisateur
-- mais un jeton propre à la Page, renvoyé par /me/accounts. Il est aussi secret
-- que les autres et suit le même régime — absent du GRANT colonne de la
-- migration 152, donc illisible par le rôle `authenticated`.
-- ============================================================================

ALTER TABLE ad_platform_connections
  ADD COLUMN IF NOT EXISTS page_access_token TEXT;

COMMENT ON COLUMN ad_platform_connections.page_access_token IS
  'Jeton de la Page Facebook, requis pour publier. Jamais accordé au rôle authenticated.';

-- ─── Journal des publications ────────────────────────────────────────────────
-- Sans trace, impossible de dire au commerçant ce qui est déjà parti, ni de
-- rattraper un échec : une publication ratée disparaîtrait sans laisser de
-- message d'erreur exploitable.

CREATE TABLE IF NOT EXISTS social_posts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  platform         TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram')),
  status           TEXT NOT NULL DEFAULT 'published'
                   CHECK (status IN ('published', 'failed')),
  message          TEXT NOT NULL,
  image_url        TEXT,
  product_id       UUID REFERENCES products(id) ON DELETE SET NULL,
  external_post_id TEXT,
  error_message    TEXT,
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS social_posts_biz_idx ON social_posts(business_id, created_at DESC);

ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;

-- Lecture seule côté client : la publication passe par l'Edge Function, seule
-- détentrice du jeton de Page.
DROP POLICY IF EXISTS "social_posts_select" ON social_posts;
CREATE POLICY "social_posts_select" ON social_posts FOR SELECT TO authenticated
  USING (
    business_id = get_user_business_id()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND (role IN ('manager', 'admin', 'owner') OR is_superadmin = true)
    )
  );

DROP TRIGGER IF EXISTS social_posts_updated_at ON social_posts;
CREATE TRIGGER social_posts_updated_at BEFORE UPDATE ON social_posts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

REVOKE ALL ON TABLE public.social_posts FROM authenticated, anon;
GRANT SELECT ON TABLE public.social_posts TO authenticated;
GRANT ALL ON TABLE public.social_posts TO service_role;

GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
