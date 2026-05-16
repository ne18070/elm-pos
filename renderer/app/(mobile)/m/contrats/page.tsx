'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { getContracts } from '@services/supabase/contracts';
import type { Contract, ContractStatus } from '@services/supabase/contracts';
import { FileSignature, Loader2, RefreshCcw, Calendar, Car } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, differenceInDays } from 'date-fns';
import { fr } from 'date-fns/locale';

const STATUS_CFG: Partial<Record<ContractStatus, { label: string; color: string; bg: string }>> = {
  draft:     { label: 'Brouillon', color: 'text-content-muted', bg: 'bg-surface-hover border-surface-border'   },
  sent:      { label: 'Envoyé',    color: 'text-amber-500',     bg: 'bg-amber-500/10 border-amber-500/20'      },
  signed:    { label: 'Signé',     color: 'text-blue-500',      bg: 'bg-blue-500/10 border-blue-500/20'        },
  active:    { label: 'Actif',     color: 'text-green-500',     bg: 'bg-green-500/10 border-green-500/20'      },
  archived:  { label: 'Archivé',   color: 'text-content-muted', bg: 'bg-surface-hover border-surface-border'   },
  cancelled: { label: 'Annulé',    color: 'text-red-500',       bg: 'bg-red-500/10 border-red-500/20'          },
};

export default function MobileContratsPage() {
  const { business } = useAuthStore();
  const [contrats, setContrats] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'actifs' | 'tous'>('actifs');

  const fetch = async () => {
    if (!business?.id) return;
    setLoading(true);
    try {
      const data = await getContracts(business.id);
      setContrats(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, [business?.id]);

  const displayed = tab === 'actifs'
    ? contrats.filter(c => c.status === 'active' || c.status === 'signed')
    : contrats;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-black text-content-primary">Contrats</h2>
          <p className="text-xs font-bold text-content-muted uppercase tracking-widest">
            {contrats.filter(c => c.status === 'active' || c.status === 'signed').length} actif(s)
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
            <FileSignature className="w-8 h-8 text-content-muted opacity-20" />
          </div>
          <p className="text-sm font-bold text-content-primary">
            {tab === 'actifs' ? 'Aucun contrat actif' : 'Aucun contrat'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map(contrat => {
            const st = STATUS_CFG[contrat.status] ?? { label: contrat.status, color: 'text-content-muted', bg: 'bg-surface-hover border-surface-border' };
            const daysLeft = contrat.end_date
              ? differenceInDays(new Date(contrat.end_date), new Date())
              : null;
            return (
              <div key={contrat.id} className="bg-surface-card rounded-2xl border border-surface-border shadow-sm p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5 flex-1 min-w-0">
                    <p className="text-sm font-black text-content-primary truncate">
                      {contrat.client_name}
                    </p>
                    {contrat.vehicle_id && (
                      <div className="flex items-center gap-1 text-content-muted">
                        <Car className="w-3 h-3 shrink-0" />
                        <p className="text-[10px] font-medium truncate">Véhicule lié</p>
                      </div>
                    )}
                  </div>
                  <span className={cn('px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border shrink-0', st.bg, st.color)}>
                    {st.label}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-surface-border/50">
                  <div className="flex items-center gap-1 text-content-muted">
                    <Calendar className="w-3 h-3 shrink-0" />
                    <span className="text-[10px] font-medium">
                      {contrat.end_date
                        ? `Fin : ${format(new Date(contrat.end_date), 'd MMM yyyy', { locale: fr })}`
                        : 'Sans date de fin'}
                    </span>
                  </div>
                  {daysLeft !== null && (
                    <span className={cn(
                      'text-[10px] font-black',
                      daysLeft < 0 ? 'text-red-500' : daysLeft <= 3 ? 'text-amber-500' : 'text-green-500'
                    )}>
                      {daysLeft < 0 ? `${Math.abs(daysLeft)}j dépassé` : `${daysLeft}j restant`}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
