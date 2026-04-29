-- Migration 034 : Policies storage pour les PDFs de prestations (services/)
-- Le bucket product-images n'avait pas de policy UPDATE,
-- et la policy DELETE exigeait d'être le owner du fichier.
-- Résultat : upsert échoue pour admin/manager si l'owner a uploadé en premier.

-- UPDATE : tout utilisateur authentifié peut écraser un fichier services/
DROP POLICY IF EXISTS "services_update" ON storage.objects;
CREATE POLICY "services_update" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'product-images'
    AND name LIKE 'services/%'
    AND auth.role() = 'authenticated'
  )
  WITH CHECK (
    bucket_id = 'product-images'
    AND name LIKE 'services/%'
    AND auth.role() = 'authenticated'
  );

-- DELETE : tout utilisateur authentifié peut supprimer dans services/
DROP POLICY IF EXISTS "services_delete" ON storage.objects;
CREATE POLICY "services_delete" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'product-images'
    AND name LIKE 'services/%'
    AND auth.role() = 'authenticated'
  );
