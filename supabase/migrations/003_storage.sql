-- ─── Bucket Supabase Storage pour les images produits ────────────────────────
-- À exécuter dans : Supabase Dashboard > SQL Editor

-- Créer le bucket public "product-images"
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- Politique : lecture publique (les images s'affichent sans auth)
CREATE POLICY "Lecture publique product-images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

-- Politique : upload uniquement pour les utilisateurs authentifiés du bon business
CREATE POLICY "Upload product-images authentifié"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'product-images'
    AND auth.role() = 'authenticated'
  );

-- Politique : suppression réservée au propriétaire du fichier
CREATE POLICY "Suppression product-images propriétaire"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'product-images'
    AND auth.uid() = owner
  );
