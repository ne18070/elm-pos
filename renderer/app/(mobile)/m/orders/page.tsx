'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { getOrders } from '@services/supabase/orders';
import { ClipboardList, Loader2, RefreshCcw, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { Order } from '@pos-types';

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  pending:   { label: 'En attente', color: 'text-amber-500',  bg: 'bg-amber-500/10 border-amber-500/20'  },
  confirmed: { label: 'Confirmée',  color: 'text-blue-500',   bg: 'bg-blue-500/10 border-blue-500/20'    },
  ready:     { label: 'Prête',      color: 'text-purple-500', bg: 'bg-purple-500/10 border-purple-500/20' },
  delivered: { label: 'Livrée',     color: 'text-green-500',  bg: 'bg-green-500/10 border-green-500/20'  },
  cancelled: { label: 'Annulée',    color: 'text-red-500',    bg: 'bg-red-500/10 border-red-500/20'      },
};

export default function OrdersPage() {
  const { business } = useAuthStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const today = format(new Date(), 'yyyy-MM-dd');

  const fetchOrders = async () => {
    if (!business?.id) return;
    setLoading(true);
    try {
      const { orders: data } = await getOrders(business.id, { limit: 30, date: today });
      setOrders(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOrders(); }, [business?.id]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-black text-content-primary">Commandes</h2>
          <p className="text-xs font-bold text-content-muted uppercase tracking-widest">
            {orders.length} commande{orders.length !== 1 ? 's' : ''} aujourd'hui
          </p>
        </div>
        <button
          onClick={fetchOrders}
          className="p-2 rounded-xl bg-surface-card border border-surface-border text-content-muted active:rotate-180 transition-transform"
        >
          <RefreshCcw className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
        </div>
      ) : orders.length === 0 ? (
        <div className="py-20 text-center space-y-4 bg-surface-card rounded-3xl border border-dashed border-surface-border">
          <div className="w-16 h-16 bg-surface-hover rounded-full flex items-center justify-center mx-auto">
            <ClipboardList className="w-8 h-8 text-content-muted opacity-20" />
          </div>
          <p className="text-sm font-bold text-content-primary">Aucune commande</p>
          <p className="text-xs text-content-muted">Pas de commandes enregistrées aujourd'hui.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(order => {
            const st = STATUS_LABELS[order.status ?? ''] ?? { label: order.status, color: 'text-content-muted', bg: 'bg-surface-hover border-surface-border' };
            return (
              <div key={order.id} className="bg-surface-card rounded-2xl border border-surface-border shadow-sm p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5 flex-1 min-w-0">
                    <p className="text-sm font-black text-content-primary truncate">
                      {order.customer_name || 'Client anonyme'}
                    </p>
                    <div className="flex items-center gap-1.5 text-content-muted">
                      <Clock className="w-3 h-3 shrink-0" />
                      <p className="text-[10px] font-medium">
                        {formatDistanceToNow(new Date(order.created_at), { addSuffix: true, locale: fr })}
                      </p>
                    </div>
                  </div>
                  <span className={cn('px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border shrink-0', st.bg, st.color)}>
                    {st.label}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-surface-border/50">
                  <p className="text-[10px] font-black uppercase tracking-widest text-content-muted">
                    #{order.id.slice(0, 8)}
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
