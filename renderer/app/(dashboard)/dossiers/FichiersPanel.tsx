import { useState, useEffect, useCallback } from 'react';
import { Loader2, HardDrive, Upload, ExternalLink, Trash2, AlertCircle } from 'lucide-react';
import { useNotificationStore } from '@/store/notifications';
import { SideDrawer } from '@/components/ui/SideDrawer';
import { ConfirmModal } from '@/components/ui/Modal';
import { 
  getFichiers, uploadFichier, deleteFichier, getSignedUrl, 
  formatBytes, getFileIcon,
  type DossierFichier, type StorageInfo 
} from '@services/supabase/dossier-fichiers';
import { type Dossier } from '@services/supabase/dossiers';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function FichiersPanel({ 
  dossier, businessId, storageInfo, onClose, onStorageChange 
}: { 
  dossier: Dossier; businessId: string; storageInfo: StorageInfo | null; onClose: () => void; onStorageChange: () => void; 
}) {
  const [fichiers, setFichiers] = useState<DossierFichier[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<DossierFichier | null>(null);
  const { error: notifError, success } = useNotificationStore();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getFichiers(dossier.id);
      setFichiers(data);
    } catch (e) { notifError(String(e)); }
    finally { setLoading(false); }
  }, [dossier.id, notifError]);

  useEffect(() => { load(); }, [load]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    
    // Validation pre-upload
    let totalSize = 0;
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE) {
        notifError(`Le fichier ${file.name} est trop volumineux (max ${formatBytes(MAX_FILE_SIZE)})`);
        return;
      }
      totalSize += file.size;
    }

    if (storageInfo && (storageInfo.used_bytes + totalSize > storageInfo.quota_bytes)) {
      notifError("Quota de stockage dépassé. Veuillez libérer de l'espace.");
      return;
    }

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await uploadFichier(dossier.id, businessId, file);
      }
      success(files.length > 1 ? 'Fichiers ajoutés' : 'Fichier ajouté');
      load();
      onStorageChange();
    } catch (e) { notifError(String(e)); }
    finally { setUploading(false); }
  }

  async function handleDelete(f: DossierFichier) {
    try {
      await deleteFichier(f);
      success('Fichier supprimé');
      setConfirmDelete(null);
      load();
      onStorageChange();
    } catch (e) { notifError(String(e)); }
  }

  return (
    <SideDrawer
      isOpen={true}
      onClose={onClose}
      title={`Fichiers — ${dossier.reference}`}
      footer={storageInfo ? (
        <div>
          <div className="flex justify-between items-center text-[10px] font-black uppercase text-content-muted mb-1.5 tracking-widest">
            <span>Stockage Dossiers</span>
            <span>{Math.round(storageInfo.used_pct)}%</span>
          </div>
          <div className="h-1.5 bg-surface-card rounded-full overflow-hidden">
            <div className={`h-full transition-all ${storageInfo.used_pct > 90 ? 'bg-status-error' : 'bg-brand-500'}`} style={{ width: `${storageInfo.used_pct}%` }} />
          </div>
          <p className="text-[9px] text-content-muted mt-2 italic">Limite : {formatBytes(storageInfo.quota_bytes)} par cabinet.</p>
        </div>
      ) : undefined}
    >
      <div className="space-y-4">
        <label className={`flex flex-col items-center justify-center py-6 px-4 bg-surface/50 border-2 border-dashed border-surface-border rounded-2xl cursor-pointer hover:bg-surface hover:border-brand-500/50 transition-all group ${uploading ? 'opacity-50 cursor-wait' : ''}`}>
          {uploading ? <Loader2 className="w-6 h-6 animate-spin text-brand-500 mb-2" /> : <Upload className="w-6 h-6 text-content-muted group-hover:text-content-brand mb-2" />}
          <span className="text-xs font-bold text-content-secondary group-hover:text-content-primary">
            {uploading ? 'Envoi en cours...' : 'Déposer des fichiers ici'}
          </span>
          <input type="file" multiple onChange={e => handleFiles(e.target.files)} className="hidden" disabled={uploading} />
        </label>

        {loading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div> : fichiers.length === 0 ? (
          <div className="py-20 text-center opacity-30">
            <HardDrive className="w-8 h-8 mx-auto mb-2" />
            <p className="text-[10px] font-black uppercase tracking-widest">Aucun fichier</p>
          </div>
        ) : (
          <div className="grid gap-2">
            {fichiers.map(f => (
              <div key={f.id} className="flex items-center justify-between p-3 bg-surface/50 rounded-xl border border-surface-border transition-all group">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-lg">{getFileIcon(f.mime_type)}</span>
                  <div className="min-w-0">
                    <p className="text-xs text-content-primary font-medium truncate">{f.nom}</p>
                    <p className="text-[9px] text-content-muted font-bold uppercase">{formatBytes(f.taille_bytes)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => getSignedUrl(f.storage_path).then(url => window.open(url, '_blank')).catch(() => notifError("Erreur lors de l'ouverture du fichier"))}
                    className="p-2 text-content-muted hover:text-content-primary hover:bg-surface-card rounded-lg transition-all"
                    title="Ouvrir"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(f)}
                    className="p-2 text-content-muted hover:text-status-error hover:bg-surface-card rounded-lg transition-all"
                    title="Supprimer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {confirmDelete && (
        <ConfirmModal
          title="Supprimer le fichier ?"
          message={`Voulez-vous supprimer définitivement "${confirmDelete.nom}" ? Cette action est irréversible.`}
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
          type="danger"
        />
      )}
    </SideDrawer>
  );
}
