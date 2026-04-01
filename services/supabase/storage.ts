import { supabase } from './client';

const BUCKET = 'product-images';

/**
 * Upload une image produit dans Supabase Storage.
 * Retourne l'URL publique de l'image.
 */
export async function uploadProductImage(
  businessId: string,
  file: File
): Promise<string> {
  const ext  = file.name.split('.').pop() ?? 'jpg';
  const path = `${businessId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Upload une image pour le menu du jour.
 */
export async function uploadMenuImage(businessId: string, file: File): Promise<string> {
  const ext  = file.name.split('.').pop() ?? 'jpg';
  const path = `${businessId}/menu/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Supprime une image produit à partir de son URL publique.
 */
export async function deleteProductImage(publicUrl: string): Promise<void> {
  // Extraire le path depuis l'URL publique
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return;
  const path = publicUrl.slice(idx + marker.length);

  await supabase.storage.from(BUCKET).remove([path]);
}
