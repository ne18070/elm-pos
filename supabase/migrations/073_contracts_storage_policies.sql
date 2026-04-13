-- ============================================================
-- 073 — Policies RLS pour le bucket "contracts"
-- ============================================================

-- Lecture publique (PDFs + signatures accessibles via URL publique)
CREATE POLICY "contracts_storage_public_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'contracts');

-- Upload par les utilisateurs authentifiés (signatures loueur, véhicules)
CREATE POLICY "contracts_storage_auth_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'contracts');

-- Mise à jour par les utilisateurs authentifiés (upsert)
CREATE POLICY "contracts_storage_auth_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'contracts');

-- Upload anonyme pour les pages publiques (signature locataire + PDF)
-- Limité aux chemins signatures/ et pdfs/
CREATE POLICY "contracts_storage_anon_sign"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'contracts'
  AND (
    name LIKE 'signatures/%'
    OR name LIKE 'pdfs/%'
  )
);

-- Mise à jour anonyme (upsert signature + pdf)
CREATE POLICY "contracts_storage_anon_update"
ON storage.objects FOR UPDATE
TO anon
USING (
  bucket_id = 'contracts'
  AND (
    name LIKE 'signatures/%'
    OR name LIKE 'pdfs/%'
  )
);
