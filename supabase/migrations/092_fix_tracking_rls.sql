-- ─── Fix RLS pour les tokens de tracking ──────────────────────────────────────
-- Corrige le placeholder par une vérification réelle via la table dossiers.

DROP POLICY IF EXISTS "manage tracking tokens" ON client_tracking_tokens;

CREATE POLICY "manage tracking tokens" ON client_tracking_tokens 
FOR ALL TO authenticated
USING (
  dossier_id IN (
    SELECT id FROM dossiers 
    WHERE business_id IN (
      SELECT business_id FROM business_members WHERE user_id = auth.uid()
      UNION SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  )
)
WITH CHECK (
  dossier_id IN (
    SELECT id FROM dossiers 
    WHERE business_id IN (
      SELECT business_id FROM business_members WHERE user_id = auth.uid()
      UNION SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  )
);

COMMENT ON POLICY "manage tracking tokens" ON client_tracking_tokens 
IS 'Permet aux membres du business de gérer les tokens de tracking liés à leurs dossiers';
