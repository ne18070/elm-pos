-- Migration 085 : Système de points de fidélité
-- Modèle cashback : X points par tranche de N CFA dépensés
-- Expiration : 31 décembre de l'année suivant l'acquisition

-- ── Config (une ligne par business) ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS loyalty_config (
  business_id   UUID        PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  earn_per      INTEGER     NOT NULL DEFAULT 1000   CHECK (earn_per   > 0),  -- 1 pt par earn_per CFA
  point_value   INTEGER     NOT NULL DEFAULT 5      CHECK (point_value > 0), -- 1 pt = point_value CFA
  min_redeem    INTEGER     NOT NULL DEFAULT 100    CHECK (min_redeem >= 1), -- seuil min pour racheter
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Transactions (grand livre des points) ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  client_name      TEXT        NOT NULL,
  client_phone     TEXT,
  type             TEXT        NOT NULL CHECK (type IN ('earn','redeem','expire','adjust')),
  points           INTEGER     NOT NULL,          -- >0 pour earn, <0 pour redeem/expire
  order_amount     NUMERIC(12,2),                 -- montant qui a généré les points
  service_order_id UUID        REFERENCES service_orders(id) ON DELETE SET NULL,
  order_id         UUID        REFERENCES orders(id)         ON DELETE SET NULL,
  note             TEXT,
  expires_at       DATE,                          -- 31 déc de l'année N+1
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS loyalty_tx_client  ON loyalty_transactions (business_id, lower(client_name));
CREATE INDEX IF NOT EXISTS loyalty_tx_date    ON loyalty_transactions (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS loyalty_tx_expiry  ON loyalty_transactions (business_id, expires_at) WHERE type = 'earn';

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE loyalty_config       ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "loyalty_config_all"  ON loyalty_config;
DROP POLICY IF EXISTS "loyalty_tx_select"   ON loyalty_transactions;
DROP POLICY IF EXISTS "loyalty_tx_insert"   ON loyalty_transactions;

CREATE POLICY "loyalty_config_all" ON loyalty_config
  USING (business_id = get_user_business_id())
  WITH CHECK (business_id = get_user_business_id());

CREATE POLICY "loyalty_tx_select" ON loyalty_transactions FOR SELECT
  USING (business_id = get_user_business_id());

CREATE POLICY "loyalty_tx_insert" ON loyalty_transactions FOR INSERT
  WITH CHECK (business_id = get_user_business_id());

-- ── Fonction publique : carte fidélité via token de suivi ─────────────────────
-- Utilisée par la page de suivi client (sans auth) pour afficher les points.

CREATE OR REPLACE FUNCTION get_public_loyalty(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id UUID;
  v_client_name TEXT;
  v_cfg         RECORD;
  v_balance     INTEGER := 0;
  v_earned      INTEGER := 0;
  v_redeemed    INTEGER := 0;
BEGIN
  -- Résoudre le token → business_id + client_name
  SELECT so.business_id, so.client_name
  INTO   v_business_id, v_client_name
  FROM   client_tracking_tokens t
  JOIN   service_orders so ON so.id = t.service_order_id
  WHERE  t.token = p_token
    AND  t.expires_at > NOW()
    AND  so.client_name IS NOT NULL
  LIMIT  1;

  IF v_business_id IS NULL OR v_client_name IS NULL THEN
    RETURN json_build_object('success', false);
  END IF;

  -- Config fidélité (doit exister et être active)
  SELECT * INTO v_cfg
  FROM   loyalty_config
  WHERE  business_id = v_business_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false);
  END IF;

  -- Calcul du solde (earn non expirés + redeem + adjust)
  SELECT
    COALESCE(SUM(CASE
      WHEN type = 'earn' AND (expires_at IS NULL OR expires_at >= CURRENT_DATE) THEN points
      WHEN type != 'earn' THEN points
      ELSE 0
    END), 0),
    COALESCE(SUM(CASE WHEN type = 'earn'   THEN points ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'redeem' THEN ABS(points) ELSE 0 END), 0)
  INTO v_balance, v_earned, v_redeemed
  FROM loyalty_transactions
  WHERE business_id = v_business_id
    AND LOWER(TRIM(client_name)) = LOWER(TRIM(v_client_name));

  RETURN json_build_object(
    'success',      true,
    'client_name',  v_client_name,
    'balance',      v_balance,
    'total_earned', v_earned,
    'total_redeemed', v_redeemed,
    'config', json_build_object(
      'earn_per',    v_cfg.earn_per,
      'point_value', v_cfg.point_value,
      'min_redeem',  v_cfg.min_redeem
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_loyalty(TEXT) TO anon, authenticated;
