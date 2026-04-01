-- Fonction agrégée pour les conversations WhatsApp
-- Gère la normalisation des numéros (+prefix), pagination et recherche multi-critères
CREATE OR REPLACE FUNCTION get_whatsapp_conversations(
  p_business_id UUID,
  p_search      TEXT    DEFAULT NULL,
  p_unread_only BOOLEAN DEFAULT FALSE,
  p_limit       INT     DEFAULT 25,
  p_offset      INT     DEFAULT 0
)
RETURNS TABLE (
  from_phone   TEXT,
  from_name    TEXT,
  last_message TEXT,
  last_at      TIMESTAMPTZ,
  unread       BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH norm AS (
    -- Normalise le numéro : ajoute '+' si absent pour fusionner les doublons
    SELECT
      CASE WHEN from_phone LIKE '+%' THEN from_phone ELSE '+' || from_phone END AS nphone,
      from_name,
      body,
      created_at,
      direction,
      status,
      order_id
    FROM whatsapp_messages
    WHERE business_id = p_business_id
  ),
  latest_msg AS (
    -- Dernier message par contact (normalisé)
    SELECT DISTINCT ON (nphone)
      nphone,
      body        AS last_message,
      created_at  AS last_at
    FROM norm
    ORDER BY nphone, created_at DESC
  ),
  latest_name AS (
    -- Dernier nom connu par contact
    SELECT DISTINCT ON (nphone)
      nphone,
      from_name
    FROM norm
    WHERE from_name IS NOT NULL AND from_name <> ''
    ORDER BY nphone, created_at DESC
  ),
  unread AS (
    -- Comptage des messages non lus par contact
    SELECT nphone, COUNT(*) AS cnt
    FROM norm
    WHERE direction = 'inbound' AND status = 'received'
    GROUP BY nphone
  ),
  order_phones AS (
    -- Contacts ayant une commande dont l'ID correspond à la recherche
    SELECT DISTINCT nphone
    FROM norm
    WHERE order_id IS NOT NULL
      AND p_search IS NOT NULL AND p_search <> ''
      AND order_id::TEXT ILIKE '%' || p_search || '%'
  )
  SELECT
    lm.nphone        AS from_phone,
    ln.from_name,
    lm.last_message,
    lm.last_at,
    COALESCE(u.cnt, 0) AS unread
  FROM latest_msg lm
  LEFT JOIN latest_name ln USING (nphone)
  LEFT JOIN unread u       USING (nphone)
  WHERE
    (
      p_search IS NULL OR p_search = '' OR
      lm.nphone        ILIKE '%' || p_search || '%' OR
      ln.from_name     ILIKE '%' || p_search || '%' OR
      lm.last_message  ILIKE '%' || p_search || '%' OR
      lm.nphone IN (SELECT nphone FROM order_phones)
    )
    AND (NOT p_unread_only OR COALESCE(u.cnt, 0) > 0)
  ORDER BY lm.last_at DESC
  -- +1 pour détecter s'il y a une page suivante
  LIMIT  p_limit + 1
  OFFSET p_offset;
$$;
