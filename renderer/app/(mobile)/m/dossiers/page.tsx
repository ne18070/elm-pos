'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { getDossiers } from '@services/supabase/dossiers';
import type { Dossier } from '@services/supabase/dossiers';
import { Scale, Loader2, RefreshCcw, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  ouvert:    { label: 'Ouvert',    color: 'text-blue-500',   bg: 'bg-blue-500/10 border-blue-500/20'   },
  en_cours:  { label: 'En cours',  color: 'text-amber-500',  bg: 'bg-amber-500/10 border-amber-500/20'  },
  audience:  { label: 'Audience',  color: 'text-purple-500', bg: 'bg-purple-500/10 border-purple-500/20' },
  clos:      { label: 'Clos',      color: 'text-content-muted', bg: 'bg-surface-hover border-surface-border' },
};

export default function MobileDossiersPage() {
  const { business } = useAuthStore();
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'actifs' | 'tous'>('actifs');

  const fetch = async () => {
    if (!business?.id) return;
    setLoading(true);
    try {
      const data = await getDossiers(business.id);
      setDossiers(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, [business?.id]);

  const displayed = tab === 'actifs'
    ? dossiers.filter(d => d.status !== 'clos')
    : dossiers;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-black text-content-primary">Dossiers</h2>
          <p className="text-xs font-bold text-content-muted uppercase tracking-widest">
            {dossiers.filter(d => d.status !== 'clos').length} actif(s)
          </p>
        </div>
        <button onClick={fetch} className="p-2 rounded-xl bg-surface-card border border-surface-border text-content-muted active:rotate-180 transition-transform">
          <RefreshCcw className="w-4 h-4" />
        </button>
      </div>

      <div className="flex gap-2 bg-surface-card rounded-2xl p-1 border border-surface-border">
        {(['actifs', 'tous'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all',
              tab === t ? 'bg-brand-500 text-white shadow-sm' : 'text-content-muted'
            )}
          >
            {t === 'actifs' ? 'En cours' : 'Tous'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
        </div>
      ) : displayed.length === 0 ? (
        <div className="py-20 text-center space-y-4 bg-surface-card rounded-3xl border border-dashed border-surface-border">
          <div className="w-16 h-16 bg-surface-hover rounded-full flex items-center justify-center mx-auto">
            <Scale className="w-8 h-8 text-content-muted opacity-20" />
          </div>
          <p className="text-sm font-bold text-content-primary">
            {tab === 'actifs' ? 'Aucun dossier actif' : 'Aucun dossier'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map(dossier => {
            const st = STATUS_CFG[dossier.status] ?? { label: dossier.status, color: 'text-content-muted', bg: 'bg-surface-hover border-surface-border' };
            return (
              <div key={dossier.id} className="bg-surface-card rounded-2xl border border-surface-border shadow-sm p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] font-black text-brand-500 uppercase tracking-widest">{dossier.reference}</p>
                    </div>
                    <p className="text-sm font-black text-content-primary truncate">{dossier.client_name}</p>
                    <p className="text-[10px] text-content-muted font-medium truncate">{dossier.type_affaire}</p>
                  </div>
                  <span className={cn('px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border shrink-0', st.bg, st.color)}>
                    {st.label}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-surface-border/50">
                  <div className="flex items-center gap-1 text-content-muted">
                    <Calendar className="w-3 h-3 shrink-0" />
                    <span className="text-[10px] font-medium">
                      {dossier.date_audience
                        ? `Audience : ${format(new Date(dossier.date_audience), 'd MMM yyyy', { locale: fr })}`
                        : `Ouvert ${formatDistanceToNow(new Date(dossier.date_ouverture), { addSuffix: true, locale: fr })}`}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
