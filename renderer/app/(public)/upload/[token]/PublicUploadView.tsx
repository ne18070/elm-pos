'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { 
  Loader2, Upload, CheckCircle2, AlertCircle, FileText, 
  ShieldCheck, Smartphone, Send, HardDrive 
} from 'lucide-react';
import { validateTrackingToken, type TrackingTokenInfo } from '@services/supabase/client-tracking';
import { uploadFichier, formatBytes } from '@services/supabase/dossier-fichiers';
import { cn } from '@/lib/utils';

export default function PublicUploadView() {
  const { token } = useParams();
  const [tokenInfo, setTokenInfo] = useState<TrackingTokenInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (token) {
      validateTrackingToken(token as string)
        .then(setTokenInfo)
        .catch(err => setError(err.message))
        .finally(() => setLoading(false));
    }
  }, [token]);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0 || !tokenInfo) return;
    
    setUploading(true);
    setError(null);
    try {
      const bizId = tokenInfo.business_id;
      const dossierId = tokenInfo.dossier_id;
      
      if (!dossierId) throw new Error("Ce lien n'est pas lié à un dossier.");

      for (let i = 0; i < files.length; i++) {
        await uploadFichier(dossierId, bizId, files[i], (p) => {
          setProgress(Math.round(((i / files.length) * 100) + (p / files.length)));
        });
      }
      
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "Erreur lors de l'envoi");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 text-center">
        <Loader2 className="w-10 h-10 animate-spin text-brand-500 mb-4" />
        <p className="text-content-secondary font-medium">Validation du lien sécurisé...</p>
      </div>
    );
  }

  if (error || !tokenInfo) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-badge-error border border-status-error/20 rounded-full flex items-center justify-center mb-6">
          <AlertCircle className="w-10 h-10 text-status-error" />
        </div>
        <h1 className="text-2xl font-black text-content-primary mb-2">Lien invalide</h1>
        <p className="text-content-secondary max-w-sm mx-auto mb-8">Ce lien de dépôt de documents a expiré ou n'existe pas. Merci de contacter votre cabinet.</p>
        <button onClick={() => window.location.reload()} className="btn-secondary">Réessayer</button>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in duration-500">
        <div className="w-24 h-24 bg-badge-success border border-status-success rounded-full flex items-center justify-center mb-8 shadow-xl shadow-green-500/20">
          <CheckCircle2 className="w-12 h-12 text-status-success" />
        </div>
        <h1 className="text-3xl font-black text-content-primary mb-3">Documents envoyés !</h1>
        <p className="text-content-secondary text-lg mb-8 max-w-md">Vos fichiers ont été déposés en toute sécurité dans votre dossier chez <strong>{tokenInfo.businesses.name}</strong>.</p>
        <div className="p-4 bg-white rounded-2xl border border-surface-border shadow-sm flex items-center gap-3">
            <ShieldCheck className="text-status-success w-5 h-5" />
            <span className="text-sm font-semibold">Transmission sécurisée terminée</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center py-12 px-6">
      <div className="max-w-xl w-full space-y-10">
        
        {/* Header / Branding */}
        <div className="text-center">
          <div className="w-20 h-20 bg-white rounded-3xl shadow-2xl border border-surface-border flex items-center justify-center mx-auto mb-6 p-4">
             {tokenInfo.businesses.logo_url ? (
               <img src={tokenInfo.businesses.logo_url} alt="Logo" className="w-full h-full object-contain" />
             ) : (
               <HardDrive className="w-10 h-10 text-brand-500" />
             )}
          </div>
          <h1 className="text-2xl font-black text-content-primary tracking-tight">{tokenInfo.businesses.name}</h1>
          <div className="inline-flex items-center gap-2 mt-4 px-4 py-1.5 rounded-full bg-badge-info/30 border border-status-info/20 text-status-info text-[10px] font-black uppercase tracking-widest">
             <ShieldCheck size={14} /> Espace de dépôt sécurisé
          </div>
        </div>

        {/* Upload Zone */}
        <div className="card p-8 border-2 border-surface-border bg-white space-y-6">
          <div className="text-center">
            <h2 className="text-lg font-bold text-content-primary">Déposer vos pièces</h2>
            <p className="text-sm text-content-secondary mt-1">Sélectionnez vos documents (photos, PDF, justificatifs) pour les ajouter à votre dossier.</p>
          </div>

          <label className={cn(
            "flex flex-col items-center justify-center py-12 px-6 rounded-3xl border-2 border-dashed transition-all cursor-pointer group",
            uploading ? "opacity-50 cursor-wait border-surface-border bg-surface-input" : "border-brand-500/30 bg-brand-500/5 hover:border-brand-500 hover:bg-white hover:shadow-2xl"
          )}>
            {uploading ? (
              <div className="flex flex-col items-center">
                <Loader2 className="w-12 h-12 animate-spin text-brand-500 mb-4" />
                <p className="text-sm font-black text-content-primary">{progress}%</p>
                <p className="text-[10px] text-content-muted uppercase font-bold mt-1">Envoi en cours...</p>
              </div>
            ) : (
              <>
                <div className="w-16 h-16 bg-white rounded-2xl shadow-lg border border-surface-border flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Upload className="w-8 h-8 text-brand-500" />
                </div>
                <span className="text-sm font-black text-content-primary group-hover:text-brand-600">Appuyez pour choisir des fichiers</span>
                <span className="text-[10px] text-content-muted font-bold uppercase mt-2">PDF, Images (Max 10 Mo)</span>
              </>
            )}
            <input 
              type="file" 
              multiple 
              onChange={e => handleUpload(e.target.files)} 
              className="hidden" 
              disabled={uploading} 
            />
          </label>

          <div className="pt-4 border-t border-surface-border flex gap-4">
             <div className="flex-1 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-surface-input flex items-center justify-center shrink-0">
                   <Smartphone className="w-5 h-5 text-content-muted" />
                </div>
                <div>
                   <p className="text-[10px] font-black text-content-muted uppercase tracking-widest leading-none">Mobile First</p>
                   <p className="text-xs font-medium text-content-secondary mt-1">Prenez directement des photos</p>
                </div>
             </div>
          </div>
        </div>

        <p className="text-center text-[10px] text-content-muted uppercase font-bold tracking-[0.2em]">
          Propulsé par ELM • Technologie Chiffrée
        </p>

      </div>
    </div>
  );
}
