-- ─── Whitelist de webhooks pour la sécurité ───────────────────────────────────
-- Évite l'exfiltration de données vers des serveurs malveillants.

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS webhook_whitelist TEXT[] DEFAULT '{}';

COMMENT ON COLUMN businesses.webhook_whitelist IS 'Liste des domaines ou URLs autorisés pour les webhooks sortants';
