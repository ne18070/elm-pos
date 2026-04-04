-- Migration 070: Fichiers joints aux dossiers + quota de stockage
-- 1 GB gratuit par business, extensible via achat

-- ── 1. Quota de stockage par business ────────────────────────────────────────

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS storage_quota_bytes  BIGINT NOT NULL DEFAULT 1073741824,  -- 1 GB
  ADD COLUMN IF NOT EXISTS storage_used_bytes   BIGINT NOT NULL DEFAULT 0;

-- ── 2. Table des fichiers ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dossier_fichiers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id    UUID NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  uploaded_by   UUID REFERENCES users(id) ON DELETE SET NULL,

  nom           TEXT NOT NULL,          -- nom original du fichier
  storage_path  TEXT NOT NULL UNIQUE,   -- chemin dans le bucket Supabase Storage
  mime_type     TEXT,
  taille_bytes  BIGINT NOT NULL DEFAULT 0,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dossier_fichiers_dossier  ON dossier_fichiers(dossier_id);
CREATE INDEX IF NOT EXISTS idx_dossier_fichiers_business ON dossier_fichiers(business_id);

-- ── 3. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE dossier_fichiers ENABLE ROW LEVEL SECURITY;

-- Membres du business peuvent voir les fichiers
CREATE POLICY "dossier_fichiers_select" ON dossier_fichiers
  FOR SELECT USING (
    business_id IN (
      SELECT business_id FROM business_members WHERE user_id = auth.uid()
    )
  );

-- Membres peuvent uploader
CREATE POLICY "dossier_fichiers_insert" ON dossier_fichiers
  FOR INSERT WITH CHECK (
    business_id IN (
      SELECT business_id FROM business_members WHERE user_id = auth.uid()
    )
  );

-- Membres peuvent supprimer leurs propres fichiers (owner/admin peuvent tout supprimer)
CREATE POLICY "dossier_fichiers_delete" ON dossier_fichiers
  FOR DELETE USING (
    business_id IN (
      SELECT bm.business_id FROM business_members bm
      WHERE bm.user_id = auth.uid()
        AND (bm.role IN ('owner', 'admin', 'manager') OR dossier_fichiers.uploaded_by = auth.uid())
    )
  );

-- ── 4. Trigger : mettre à jour storage_used_bytes automatiquement ─────────────

CREATE OR REPLACE FUNCTION update_storage_used()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE businesses
      SET storage_used_bytes = storage_used_bytes + NEW.taille_bytes
      WHERE id = NEW.business_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE businesses
      SET storage_used_bytes = GREATEST(0, storage_used_bytes - OLD.taille_bytes)
      WHERE id = OLD.business_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_storage_used ON dossier_fichiers;
CREATE TRIGGER trg_storage_used
  AFTER INSERT OR DELETE ON dossier_fichiers
  FOR EACH ROW EXECUTE FUNCTION update_storage_used();

-- ── 5. Bucket Storage (à créer manuellement dans le dashboard Supabase) ───────
-- Nom du bucket : dossier-files
-- Public : NON (accès via signed URLs uniquement)
-- Taille max par fichier : 50 MB
--
-- Policies Storage à créer :
--   SELECT  : bucket = 'dossier-files' AND auth.uid() IN (members of business)
--   INSERT  : idem
--   DELETE  : idem (owner/admin uniquement)
