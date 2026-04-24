import { supabase } from './client';

export interface DossierFichier {
  id:           string;
  dossier_id:   string;
  business_id:  string;
  uploaded_by:  string | null;
  nom:          string;
  storage_path: string;
  mime_type:    string | null;
  taille_bytes: number;
  created_at:   string;
  url?:         string;   // signed URL (chargée à la demande)
}

export interface StorageInfo {
  used_bytes:  number;
  quota_bytes: number;
  used_pct:    number;     // 0-100
}

const BUCKET = 'dossier-files';
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB par fichier

// --- Lecture ------------------------------------------------------------------

export async function getFichiers(dossierId: string): Promise<DossierFichier[]> {
  const { data, error } = await (supabase as any)
    .from('dossier_fichiers')
    .select('*')
    .eq('dossier_id', dossierId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 60 * 60); // valide 1h
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function getStorageInfo(businessId: string): Promise<StorageInfo> {
  const [quotaRes, usedRes] = await Promise.all([
    (supabase as any).from('businesses').select('storage_quota_bytes').eq('id', businessId).single(),
    (supabase as any).from('dossier_fichiers').select('taille_bytes').eq('business_id', businessId),
  ]);
  if (quotaRes.error) throw new Error(quotaRes.error.message);
  if (usedRes.error) throw new Error(usedRes.error.message);
  const quota = quotaRes.data?.storage_quota_bytes ?? 1073741824;
  const used  = (usedRes.data ?? []).reduce((sum: number, r: { taille_bytes: number }) => sum + (r.taille_bytes ?? 0), 0);
  return {
    used_bytes:  used,
    quota_bytes: quota,
    used_pct:    quota > 0 ? Math.min(100, (used / quota) * 100) : 0,
  };
}

// --- Upload -------------------------------------------------------------------

export async function uploadFichier(
  dossierId:  string,
  businessId: string,
  file:       File,
  onProgress?: (pct: number) => void,
): Promise<DossierFichier> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`Fichier trop volumineux (max 50 Mo, reçu ${formatBytes(file.size)})`);
  }

  // Vérifier le quota restant
  const info = await getStorageInfo(businessId);
  if (info.used_bytes + file.size > info.quota_bytes) {
    const restant = info.quota_bytes - info.used_bytes;
    throw new Error(
      `Quota de stockage dépassé - il reste ${formatBytes(restant)} disponible sur ${formatBytes(info.quota_bytes)}.`
    );
  }

  // Chemin unique dans le bucket
  const ext  = file.name.split('.').pop() ?? 'bin';
  const path = `${businessId}/${dossierId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  onProgress?.(10);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) throw new Error(uploadError.message);

  onProgress?.(80);

  // Enregistrer en base
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await (supabase as any)
    .from('dossier_fichiers')
    .insert({
      dossier_id:   dossierId,
      business_id:  businessId,
      uploaded_by:  user?.id ?? null,
      nom:          file.name,
      storage_path: path,
      mime_type:    file.type || null,
      taille_bytes: file.size,
    })
    .select()
    .single();

  if (error) {
    // Rollback : supprimer le fichier uploadé
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(error.message);
  }

  onProgress?.(100);
  return data as DossierFichier;
}

// --- Suppression --------------------------------------------------------------

export async function deleteFichier(fichier: DossierFichier): Promise<void> {
  // Supprimer du storage d'abord
  await supabase.storage.from(BUCKET).remove([fichier.storage_path]);
  // Supprimer de la base (le trigger met à jour storage_used_bytes)
  const { error } = await (supabase as any)
    .from('dossier_fichiers')
    .delete()
    .eq('id', fichier.id);
  if (error) throw new Error(error.message);
}

// --- Helpers ------------------------------------------------------------------

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 o';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} Go`;
}

export function getFileIcon(mimeType: string | null): string {
  if (!mimeType) return '📎';
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType === 'application/pdf') return '📄';
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
  if (mimeType.includes('excel') || mimeType.includes('sheet')) return '📊';
  if (mimeType.includes('zip') || mimeType.includes('compressed')) return '🗜️';
  return '📎';
}
