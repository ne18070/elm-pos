-- Migration : Versioning des Workflows (Corrected RLS)
-- Permet de conserver l'historique des définitions de processus pour audit et restauration.

CREATE TABLE IF NOT EXISTS workflow_versions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id      UUID        NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  version          INT         NOT NULL,
  definition       JSONB       NOT NULL,
  created_by       UUID        REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index pour accélérer la récupération de l'historique
CREATE INDEX IF NOT EXISTS idx_workflow_versions_wf ON workflow_versions(workflow_id, version DESC);

-- RLS
ALTER TABLE workflow_versions ENABLE ROW LEVEL SECURITY;

-- Lecture : accessible à tous les membres du business
DROP POLICY IF EXISTS "read workflow versions" ON workflow_versions;
CREATE POLICY "read workflow versions" ON workflow_versions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workflows w 
    WHERE w.id = workflow_versions.workflow_id 
      AND w.business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid())
  ));

-- Insertion : seul le trigger (SECURITY DEFINER) ou un admin peut insérer
-- On ajoute une policy INSERT pour permettre la restauration manuelle via saveWorkflow
DROP POLICY IF EXISTS "insert workflow versions" ON workflow_versions;
CREATE POLICY "insert workflow versions" ON workflow_versions
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM workflows w 
    WHERE w.id = workflow_versions.workflow_id 
      AND w.business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid() AND role IN ('owner', 'manager', 'admin'))
  ));

-- Trigger pour sauvegarder automatiquement une version lors d'un update sur workflows
-- SECURITY DEFINER permet au trigger d'insérer même si l'utilisateur a des droits restreints sur la table de versions
CREATE OR REPLACE FUNCTION save_workflow_version()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF (OLD.definition IS DISTINCT FROM NEW.definition) THEN
    INSERT INTO workflow_versions (workflow_id, version, definition, created_by)
    VALUES (OLD.id, OLD.version, OLD.definition, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_save_workflow_version ON workflows;
CREATE TRIGGER trg_save_workflow_version
  BEFORE UPDATE ON workflows
  FOR EACH ROW
  EXECUTE FUNCTION save_workflow_version();
