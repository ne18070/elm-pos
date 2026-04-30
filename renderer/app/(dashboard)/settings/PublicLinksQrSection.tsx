import { useState } from 'react';
import html2canvas from 'html2canvas';
import { Copy, ArrowRight, Download, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { ALL_PUBLIC_MODULES, getAppUrl, qrImageUrl } from './settings-utils';
import { buildPublicBusinessRef } from '@services/supabase/public-business-ref';
import { toUserError } from '@/lib/user-error';

export function PublicLinksQrSection() {
  const { business } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();
  const [downloadingQr, setDownloadingQr] = useState<string | null>(null);

  if (!business) return null;

  async function downloadQrPng(moduleKey: string, moduleLabel: string) {
    const node = document.getElementById(`public-qr-${moduleKey}`);
    if (!node || !business) return;

    setDownloadingQr(moduleKey);
    try {
      const canvas = await html2canvas(node, {
        backgroundColor: '#ffffff',
        scale: 3,
        useCORS: true,
      });
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `${business.public_slug || 'business'}-${moduleKey}-qr.png`;
      link.click();
      success(`QR Code ${moduleLabel} exporté`);
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setDownloadingQr(null);
    }
  }

  const publicModules = ALL_PUBLIC_MODULES.filter(({ features, bizTypes }) => {
    const bFeatures = business.features ?? [];
    const bTypes: string[] = (business as any).types ?? (business.type ? [business.type] : []);
    const hasFeature = features.some(f => bFeatures.includes(f));
    const hasBizType = bizTypes?.some(t => bTypes.includes(t));
    return hasFeature || hasBizType;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-content-primary">Liens publics & QR Codes</h2>
          <p className="text-xs text-content-muted mt-0.5">Partagez votre catalogue ou vos services avec vos clients</p>
        </div>
        <button
          onClick={() => {
            const allLinks = publicModules.map(({ key, label }) => {
              const publicRef = buildPublicBusinessRef(business.name, business.public_slug);
              return `${label}: ${getAppUrl()}/${key}/${publicRef}`;
            }).join('\n');
            navigator.clipboard.writeText(allLinks).then(() => success('Tous les liens copiés'));
          }}
          className="btn-secondary h-9 px-4 text-xs flex items-center gap-2"
        >
          <Copy className="w-3.5 h-3.5" /> Copier tous les liens
        </button>
      </div>

      {!business.public_slug && (
        <div className="p-4 bg-badge-error/20 border border-status-error/20 rounded-2xl flex items-start gap-3">
          <div className="text-status-error">⚠</div>
          <div>
            <p className="text-sm font-bold text-status-error leading-tight">Slug public non défini</p>
            <p className="text-xs text-content-secondary mt-1">
              Veuillez définir un slug dans les paramètres de l&apos;établissement pour générer des liens valides.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {publicModules.map(({ key, label, icon: Icon }) => {
          const publicRef = buildPublicBusinessRef(business.name, business.public_slug);
          const url = `${getAppUrl()}/${key}/${publicRef}`;

          return (
            <div key={key} className="rounded-2xl border border-surface-border bg-surface-card overflow-hidden shadow-sm hover:border-brand-500/30 transition-all group">
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 text-content-brand" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-content-primary">{label}</p>
                      <p className="text-[10px] font-mono text-content-secondary truncate">{url}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadQrPng(key, label)}
                    disabled={downloadingQr === key || !business.public_slug}
                    className="p-2.5 bg-surface-input hover:bg-surface-hover text-content-secondary hover:text-content-primary rounded-xl border border-surface-border transition-all shrink-0"
                    title="Exporter en PNG"
                  >
                    {downloadingQr === key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(url).then(() => success('Lien copié'))}
                    disabled={!business.public_slug}
                    className="flex-1 btn-secondary h-9 text-xs flex items-center justify-center gap-2"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copier
                  </button>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className={`flex-1 btn-secondary h-9 text-xs flex items-center justify-center gap-2 ${!business.public_slug ? 'pointer-events-none opacity-50' : ''}`}
                  >
                    <ArrowRight className="w-3.5 h-3.5" /> Ouvrir
                  </a>
                </div>

                {/* QR Visual */}
                <div className="rounded-2xl bg-white p-5 border border-surface-border flex items-center justify-center relative group-hover:scale-[1.02] transition-transform">
                  {!business.public_slug && (
                    <div className="absolute inset-0 z-10 bg-white/80 backdrop-blur-[1px] flex items-center justify-center p-6 text-center">
                      <p className="text-xs text-content-muted font-medium italic">Enregistrez un slug public pour générer le QR</p>
                    </div>
                  )}
                  <div
                    id={`public-qr-${key}`}
                    className="relative w-[180px] h-[180px] rounded-[24px] bg-white p-2"
                  >
                    <img
                      src={qrImageUrl(url)}
                      alt={`QR ${label}`}
                      crossOrigin="anonymous"
                      className="w-full h-full object-contain"
                    />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div
                        className="w-12 h-12 rounded-xl border border-slate-100 shadow-sm overflow-hidden flex items-center justify-center p-1.5"
                        style={{ backgroundColor: '#ffffff' }}
                      >
                        {business.logo_url ? (
                          <img
                            src={business.logo_url}
                            alt="logo"
                            crossOrigin="anonymous"
                            className="max-w-full max-h-full object-contain"
                          />
                        ) : (
                          <img
                            src="/logo.png"
                            alt="ELM"
                            className="max-w-full max-h-full object-contain"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      {publicModules.length === 0 && (
        <div className="card p-12 text-center text-content-muted italic bg-surface/30">
          Aucun module public disponible pour votre type d&apos;activité.
        </div>
      )}
    </div>
  );
}
