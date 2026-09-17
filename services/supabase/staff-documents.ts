import { supabase } from './client';
import type { TablesInsert } from './database.types';

export type StaffDocumentCategory = 'contrat' | 'identite' | 'diplome' | 'avenant' | 'autre';

export interface StaffDocument {
  id:              string;
  business_id:     string;
  staff_id:        string;
  uploaded_by:     string | null;
  category:        string;
  nom:             string;
  storage_path:    string;
  mime_type:       string | null;
  taille_bytes:    number;
  is_confidential: boolean;
  created_at:      string;
  url?:            string; // signed URL (chargée à la demande)
}

export const STAFF_DOCUMENT_CATEGORY_LABELS: Record<StaffDocumentCategory, string> = {
  contrat:  'Contrat',
  identite: "Pièce d'identité",
  diplome:  'Diplôme / Certification',
  avenant:  'Avenant',
  autre:    'Autre',
};

export interface StorageInfo {
  used_bytes:  number;
  quota_bytes: number;
  used_pct:    number; // 0-100
}

const BUCKET = 'staff-documents';
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB par fichier

// --- Lecture ------------------------------------------------------------------

/** Quota de stockage partagé du business (compteur maintenu par trigger sur staff_documents + dossier_fichiers) */
export async function getStorageInfo(businessId: string): Promise<StorageInfo> {
  const { data, error } = await supabase
    .from('businesses')
    .select('storage_quota_bytes, storage_used_bytes')
    .eq('id', businessId)
    .single();
  if (error) throw new Error(error.message);
  const quota = data?.storage_quota_bytes ?? 1073741824;
  const used  = data?.storage_used_bytes ?? 0;
  return {
    used_bytes:  used,
    quota_bytes: quota,
    used_pct:    quota > 0 ? Math.min(100, (used / quota) * 100) : 0,
  };
}

export async function getStaffDocuments(staffId: string): Promise<StaffDocument[]> {
  const { data, error } = await supabase
    .from('staff_documents')
    .select('*')
    .eq('staff_id', staffId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as StaffDocument[];
}

export async function getSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 60 * 60); // valide 1h
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

// --- Upload -------------------------------------------------------------------

export async function uploadStaffDocument(
  staffId:    string,
  businessId: string,
  file:       File,
  options?: { category?: string; isConfidential?: boolean },
): Promise<StaffDocument> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`Fichier trop volumineux (max 50 Mo, reçu ${formatBytes(file.size)})`);
  }

  const info = await getStorageInfo(businessId);
  if (info.used_bytes + file.size > info.quota_bytes) {
    const restant = info.quota_bytes - info.used_bytes;
    throw new Error(
      `Quota de stockage dépassé - il reste ${formatBytes(restant)} disponible sur ${formatBytes(info.quota_bytes)}.`
    );
  }

  const path = `${businessId}/${staffId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${file.name.split('.').pop() ?? 'bin'}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) throw new Error(uploadError.message);

  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('staff_documents')
    .insert({
      business_id:     businessId,
      staff_id:        staffId,
      uploaded_by:     user?.id ?? null,
      category:        options?.category ?? 'autre',
      nom:             file.name,
      storage_path:    path,
      mime_type:       file.type || null,
      taille_bytes:    file.size,
      is_confidential: options?.isConfidential ?? false,
    } as unknown as TablesInsert<'staff_documents'>)
    .select()
    .single();

  if (error) {
    // Rollback : supprimer le fichier uploadé
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(error.message);
  }

  return data as unknown as StaffDocument;
}

// --- Suppression --------------------------------------------------------------

export async function deleteStaffDocument(doc: StaffDocument): Promise<void> {
  await supabase.storage.from(BUCKET).remove([doc.storage_path]);
  const { error } = await supabase.from('staff_documents').delete().eq('id', doc.id);
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
  return '📎';
}
