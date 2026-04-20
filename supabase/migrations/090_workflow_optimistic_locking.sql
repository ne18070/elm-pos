-- ─── Optimistic Locking pour les instances de workflow ─────────────────────────
-- Ajout de la colonne version pour éviter les race conditions lors des updates.

ALTER TABLE workflow_instances ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

COMMENT ON COLUMN workflow_instances.version IS 'Version de l''instance pour optimistic locking';
