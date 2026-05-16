'use client';

import { useEffect, useState, useCallback } from 'react';
import { Package, Truck, Clock, CheckCircle, Loader2, RefreshCcw, Phone, MapPin } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { supabase } from '@services/supabase/client';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';

type Channel = 'emporter' | 'livraison';
type TakeawayStatus = 'pending' | 'ready' | 'done';

interface TakeawayOrder {
  id: string;
  order_number?: string;
  customer_name?: string;
  customer_phone?: string;
  delivery_address?: string;
  order_channel: Channel;
  total: number;
  status: TakeawayStatus;
  created_at: string;
  items: { name: string; quantity: number; price: number }[];
}

const STATUS_LABELS: Record<TakeawayStatus, string> = {
  pending: 'En préparation',
  ready:   'Prêt',
  done:    'Terminé',
};

const STATUS_COLORS: Record<TakeawayStatus, string> = {
  pending: 'text-status-warning bg-badge-warning border-status-warning',
  ready:   'text-status-success bg-badge-success border-status-success',
  done:    'text-content-secondary bg-surface-input border-surface-border',
};

const NEXT_STATUS: Record<TakeawayStatus, TakeawayStatus | null> = {
  pending: 'ready',
  ready:   'done',
  done:    null,
};

const NEXT_LABEL: Record<TakeawayStatus, string> = {
  pending: 'Marquer prêt',
  ready:   'Marquer récupéré',
  done:    '',
};

export default function CommandesEmporterPage() {
  const { business } = useAuthStore();
  const [orders, setOrders]   = useState<TakeawayOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<'all' | Channel>('all');
  const [updating, setUpdating] = useState<string | null>(null);

  const fmt = (v: number) => formatCurrency(v, business?.currency ?? 'XOF');

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data } = await (supabase as any)
        .from('orders')
        .select('id, order_number, customer_name, customer_phone, delivery_address, order_channel, total, status, created_at, items')
        .eq('business_id', business.id)
        .in('order_channel', ['emporter', 'livraison'])
        .gte('created_at', today.toISOString())
        .order('created_at', { ascending: false });

      setOrders((data ?? []).map((o: any) => ({
        ...o,
        status: o.status === 'completed' ? 'done' : (o.status ?? 'pending'),
      })));
    } finally {
      setLoading(false);
    }
  }, [business?.id]);

  useEffect(() => { load(); }, [load]);

  async function advanceStatus(order: TakeawayOrder) {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    setUpdating(order.id);
    const dbStatus = next === 'done' ? 'completed' : next;
    await (supabase as any)
      .from('orders')
      .update({ status: dbStatus })
      .eq('id', order.id);
    setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: next } : o));
    setUpdating(null);
  }

  const displayed = orders.filter(o => tab === 'all' || o.order_channel === tab);
  const pendingCount = orders.filter(o => o.status === 'pending').length;
  const readyCount   = orders.filter(o => o.status === 'ready').length;

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-content-primary">À emporter & Livraison</h1>
          <p className="text-xs font-bold text-content-muted uppercase tracking-widest mt-0.5">
            Aujourd'hui · {orders.length} commande{orders.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={load} className="p-2 rounded-xl bg-surface-card border border-surface-border text-content-muted hover:text-content-primary transition-colors">
          <RefreshCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Compteurs */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-badge-warning border border-status-warning rounded-2xl p-4 text-center">
          <p className="text-3xl font-black text-status-warning">{pendingCount}</p>
          <p className="text-xs font-bold text-status-warning uppercase tracking-wider">En préparation</p>
        </div>
        <div className="bg-badge-success border border-status-success rounded-2xl p-4 text-center">
          <p className="text-3xl font-black text-status-success">{readyCount}</p>
          <p className="text-xs font-bold text-status-success uppercase tracking-wider">Prêts</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-surface-card rounded-2xl p-1 border border-surface-border">
        {([
          { key: 'all',      label: 'Tous'       },
          { key: 'emporter', label: 'À emporter' },
          { key: 'livraison',label: 'Livraison'  },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all',
              tab === key ? 'bg-brand-500 text-white shadow-sm' : 'text-content-muted'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
        </div>
      ) : displayed.length === 0 ? (
        <div className="py-20 text-center space-y-3 bg-surface-card rounded-3xl border border-dashed border-surface-border">
          <Package className="w-10 h-10 text-content-muted opacity-20 mx-auto" />
          <p className="text-sm font-bold text-content-primary">Aucune commande pour l'instant</p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map(order => (
            <div key={order.id} className="bg-surface-card rounded-2xl border border-surface-border p-4 space-y-3">
              {/* Top row */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  {order.order_channel === 'livraison'
                    ? <Truck className="w-4 h-4 text-brand-400 shrink-0" />
                    : <Package className="w-4 h-4 text-content-muted shrink-0" />}
                  <div>
                    <p className="text-sm font-black text-content-primary">
                      {order.customer_name ?? 'Client anonyme'}
                    </p>
                    <p className="text-[10px] font-bold text-content-muted uppercase tracking-wide flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {new Date(order.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      {order.order_number && ` · #${order.order_number}`}
                    </p>
                  </div>
                </div>
                <span className={cn('text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border', STATUS_COLORS[order.status])}>
                  {STATUS_LABELS[order.status]}
                </span>
              </div>

              {/* Items */}
              <div className="bg-surface-input rounded-xl p-3 space-y-1">
                {(order.items ?? []).map((item: any, i: number) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-content-secondary">{item.quantity}× {item.name}</span>
                    <span className="text-content-primary font-medium">{fmt(item.price * item.quantity)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-black text-content-primary pt-1 border-t border-surface-border">
                  <span>Total</span>
                  <span className="text-content-brand">{fmt(order.total)}</span>
                </div>
              </div>

              {/* Contact / adresse */}
              {(order.customer_phone || order.delivery_address) && (
                <div className="space-y-1">
                  {order.customer_phone && (
                    <a href={`tel:${order.customer_phone}`} className="flex items-center gap-1.5 text-xs text-content-secondary hover:text-content-brand transition-colors">
                      <Phone className="w-3 h-3" /> {order.customer_phone}
                    </a>
                  )}
                  {order.delivery_address && (
                    <p className="flex items-center gap-1.5 text-xs text-content-secondary">
                      <MapPin className="w-3 h-3 shrink-0" /> {order.delivery_address}
                    </p>
                  )}
                </div>
              )}

              {/* Action */}
              {NEXT_STATUS[order.status] && (
                <button
                  onClick={() => advanceStatus(order)}
                  disabled={updating === order.id}
                  className={cn(
                    'w-full h-9 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-colors',
                    order.status === 'pending'
                      ? 'bg-status-warning/10 border border-status-warning text-status-warning hover:bg-status-warning/20'
                      : 'bg-badge-success border border-status-success text-status-success hover:bg-status-success/20'
                  )}
                >
                  {updating === order.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <CheckCircle className="w-3.5 h-3.5" />}
                  {NEXT_LABEL[order.status]}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
