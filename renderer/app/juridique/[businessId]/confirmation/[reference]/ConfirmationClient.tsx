'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Scale,
} from 'lucide-react';
import { getPublicLegalInfo, type PublicLegalInfo } from '@services/supabase/legal-public';

export default function ConfirmationClient() {
  const { businessId, reference } = useParams<{ businessId: string; reference: string }>();
  const [info, setInfo] = useState<PublicLegalInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId) return;
    getPublicLegalInfo(businessId)
      .then((data) => {
        if (!data) setError('Cabinet introuvable.');
        else setInfo(data);
      })
      .catch(() => setError('Impossible de charger la confirmation.'))
      .finally(() => setLoading(false));
  }, [businessId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-brand-600" />
      </div>
    );
  }

  if (error || !info) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="bg-surface-card rounded-2xl border border-surface-border p-8 text-center max-w-sm w-full space-y-4">
          <AlertCircle className="w-12 h-12 text-status-error mx-auto" />
          <p className="font-semibold text-content-primary">{error}</p>
          <a
            href={`/juridique/${businessId}`}
            className="block w-full py-3 rounded-xl bg-brand-600 text-content-primary font-semibold text-sm text-center"
          >
            Retour au cabinet
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface pb-16">
      <header className="bg-surface-card border-b border-surface-border shadow-sm sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-xl bg-white border border-surface-border overflow-hidden shrink-0">
              {info.logo_url ? (
                <img src={info.logo_url} alt={info.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-brand-600 flex items-center justify-center">
                  <Scale className="w-5 h-5 text-content-primary" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-content-primary truncate">{info.name}</h1>
              <p className="text-xs text-content-secondary">Rendez-vous juridique</p>
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-white border border-surface-border flex items-center justify-center p-1 shrink-0">
            <img src="/logo.png" alt="ELM APP" className="w-full h-full object-contain" />
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <div className="bg-surface-card rounded-2xl border border-surface-border p-6 text-center space-y-3">
          <div className="w-16 h-16 bg-badge-success rounded-full flex items-center justify-center mx-auto border border-status-success/30">
            <CheckCircle2 className="w-8 h-8 text-status-success" />
          </div>
          <h2 className="font-black text-xl text-content-primary">Demande envoyee</h2>
          <p className="text-content-secondary text-sm">
            Votre demande de rendez-vous a bien ete transmise au cabinet.
          </p>
          <div className="inline-flex items-center gap-2 bg-surface-input border border-surface-border rounded-xl px-4 py-2">
            <Calendar className="w-4 h-4 text-content-secondary" />
            <span className="font-mono font-bold text-content-primary">#{reference}</span>
          </div>
        </div>

        <div className="bg-badge-info border border-brand-500/30 rounded-2xl p-4 flex items-start gap-3">
          <MessageCircle className="w-5 h-5 text-status-info shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-content-primary text-sm">Prochaine etape</p>
            <p className="text-xs text-content-secondary mt-0.5">
              Le cabinet vous recontactera pour confirmer l'horaire et preparer le rendez-vous.
            </p>
          </div>
        </div>

        <a
          href={`/juridique/${businessId}`}
          className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl border border-surface-border text-content-secondary font-semibold text-sm hover:bg-surface-hover transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour au formulaire
        </a>
      </main>
    </div>
  );
}
