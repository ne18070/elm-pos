-- ─── Configuration Storage Dossiers ──────────────────────────────────────────
-- Migration 087 : Création du bucket sécurisé pour les fichiers de dossiers.

-- 1. Création du bucket s'il n'existe pas
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('dossier-files', 'dossier-files', false, 52428800) -- 50 Mo
ON CONFLICT (id) DO NOTHING;

-- 2. Politiques RLS pour le bucket 'dossier-files'
-- Note : L'utilisateur doit appartenir au business pour accéder aux fichiers.
-- Le storage path est structuré comme : {business_id}/{dossier_id}/{filename}

-- Lecture : Membres du business (owner, admin, manager)
CREATE POLICY "dossier_files_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'dossier-files' AND
    (storage.foldername(name))[1]::uuid IN (
      SELECT business_id FROM public.business_members WHERE user_id = auth.uid()
    )
  );

-- Insertion : Membres du business
CREATE POLICY "dossier_files_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'dossier-files' AND
    (storage.foldername(name))[1]::uuid IN (
      SELECT business_id FROM public.business_members WHERE user_id = auth.uid()
    )
  );

-- Suppression : Admin ou Owner du business
CREATE POLICY "dossier_files_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'dossier-files' AND
    (storage.foldername(name))[1]::uuid IN (
      SELECT business_id FROM public.business_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );
