'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { getServiceOrders } from '@services/supabase/service-orders';
import { Wrench, Loader2, RefreshCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { ServiceOrder, ServiceOrderStatus } from '@services/supabase/service-orders';

const STATUS_CFG: Record<ServiceOrderStatus, { label: string; color: string; bg: string }> = {
  attente:   { label: 'En attente', color: 'text-amber-500',  bg: 'bg-amber-500/10 border-amber-500/20'  },
  en_cours:  { label: 'En cours',   color: 'text-blue-500',   bg: 'bg-blue-500/10 border-blue-500/20'    },
  pause:     { label: 'Pause',      color: 'text-orange-500', bg: 'bg-orange-500/10 border-orange-500/20' },
  termine:   { label: 'Terminé',    color: 'text-purple-500', bg: 'bg-purple-500/10 border-purple-500/20' },
  paye:      { label: 'Payé',       color: 'text-green-500',  bg: 'bg-green-500/10 border-green-500/20'  },
  annule:    { label: 'Annulé',     color: 'text-red-500',    bg: 'bg-red-500/10 border-red-500/20'      },
};

const ACTIVE_STATUSES: ServiceOrderStatus[] = ['attente', 'en_cours', 'pause'];

export default function MobileServicesPage() {
  const { business } = useAuthStore();
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'actifs' | 'tous'>('actifs');

  const fetch = async () => {
    if (!business?.id) return;
    setLoading(true);
    try {
      const { data } = await getServiceOrders(business.id, { pageSize: 100 });
      setOrders(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, [business?.id]);

  const displayed = tab === 'actifs'
    ? orders.filter(o => ACTIVE_STATUSES.includes(o.status))
    : orders;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-black text-content-primary">Prestations</h2>
          <p className="text-xs font-bold text-content-muted uppercase tracking-widest">
            {orders.filter(o => ACTIVE_STATUSES.includes(o.status)).length} actif(s)
          </p>
        </div>
        <button onClick={fetch} className="p-2 rounded-xl bg-surface-card border border-surface-border text-content-muted active:rotate-180 transition-transform">
          <RefreshCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
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
            <Wrench className="w-8 h-8 text-content-muted opacity-20" />
          </div>
          <p className="text-sm font-bold text-content-primary">
            {tab === 'actifs' ? 'Aucun ordre actif' : 'Aucune prestation'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map(order => {
            const st = STATUS_CFG[order.status];
            return (
              <div key={order.id} className="bg-surface-card rounded-2xl border border-surface-border shadow-sm p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5 flex-1 min-w-0">
                    <p className="text-sm font-black text-content-primary truncate">
                      {order.client_name || 'Client anonyme'}
                    </p>
                    {order.subject_ref && (
                      <p className="text-[10px] text-content-muted font-medium truncate italic">
                        {order.subject_ref}{order.subject_info ? ` — ${order.subject_info}` : ''}
                      </p>
                    )}
                  </div>
                  <span className={cn('px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border shrink-0', st.bg, st.color)}>
                    {st.label}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-surface-border/50">
                  <p className="text-[10px] text-content-muted font-medium">
                    {formatDistanceToNow(new Date(order.created_at), { addSuffix: true, locale: fr })}
                  </p>
                  <p className="text-base font-black text-content-primary">
                    {order.total.toLocaleString()} <span className="text-[10px] opacity-60">FCFA</span>
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
