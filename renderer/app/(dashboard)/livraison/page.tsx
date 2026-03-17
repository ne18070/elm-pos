'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Truck, Clock, CheckCircle, Package } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { formatCurrency } from '@/lib/utils';
import { OrderVerification } from '@/components/livraison/OrderVerification';
import {
  getOrdersForDelivery,
  startOrderPicking,
  confirmOrderDelivery,
} from '@services/supabase/orders';
import { supabase } from '@/lib/supabase';
import type { Order } from '@pos-types';

const DELIVERY_LABELS = {
  pending:   { label: 'En attente',  color: 'text-yellow-400 bg-yellow-900/20 border-yellow-800' },
  picking:   { label: 'En cours',    color: 'text-brand-400 bg-brand-900/20 border-brand-800'   },
  delivered: { label: 'Livré',       color: 'text-green-400 bg-green-900/20 border-green-800'   },
};

export default function LivraisonPage() {
  const { business, user } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Order | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    try {
      const data = await getOrdersForDelivery(business.id);
      setOrders(data);
    } catch (err) {
      notifError(String(err));
    } finally {
      setLoading(false);
    }
  }, [business?.id]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // Realtime : mise à jour automatique quand une commande change de statut
  useEffect(() => {
    if (!business?.id) return;
    const channel = supabase
      .channel(`delivery:${business.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `business_id=eq.${business.id}` },
        () => { fetchOrders(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [business?.id, fetchOrders]);

  async function handleSelect(order: Order) {
    setSelected(order);
    // Marquer "en cours" si encore en attente
    if (order.delivery_status === 'pending') {
      try {
        await startOrderPicking(order.id);
        setOrders((prev) =>
          prev.map((o) => o.id === order.id ? { ...o, delivery_status: 'picking' } : o)
        );
      } catch { /* ignorer si déjà en cours */ }
    }
  }

  async function handleConfirm() {
    if (!selected || !user) return;
    try {
      await confirmOrderDelivery(selected.id, user.id);
      success(`Commande #${selected.id.slice(0, 8).toUpperCase()} livrée ✓`);
      setSelected(null);
      fetchOrders();
    } catch (err) {
      notifError(String(err));
    }
  }

  const pending   = orders.filter((o) => o.delivery_status === 'pending');
  const picking   = orders.filter((o) => o.delivery_status === 'picking');

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Colonne gauche : liste des commandes ── */}
      <div className={`flex flex-col border-r border-surface-border transition-all ${
        selected ? 'w-80 shrink-0' : 'flex-1'
      }`}>
        {/* Header */}
        <div className="p-6 border-b border-surface-border">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <Truck className="w-5 h-5 text-brand-400" />
                Livraisons
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {orders.length} commande{orders.length !== 1 ? 's' : ''} à traiter
              </p>
            </div>
            <button onClick={fetchOrders} className="btn-secondary p-2" title="Actualiser">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Liste */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="text-slate-400 text-center py-16 text-sm">Chargement…</div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
              <CheckCircle className="w-12 h-12 opacity-30" />
              <p className="font-medium">Tout est livré !</p>
              <p className="text-xs text-center">Aucune commande en attente de vérification.</p>
            </div>
          ) : (
            <>
              {/* En cours en premier */}
              {[...picking, ...pending].map((order) => {
                const badge = DELIVERY_LABELS[order.delivery_status];
                const itemCount = order.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;
                const isSelected = selected?.id === order.id;

                return (
                  <button
                    key={order.id}
                    onClick={() => handleSelect(order)}
                    className={`w-full text-left p-4 rounded-xl border transition-all
                      ${isSelected
                        ? 'border-brand-500 bg-brand-900/10'
                        : 'border-surface-border bg-surface-card hover:border-slate-600 hover:bg-surface-hover'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-mono font-bold text-white text-sm">
                          #{order.id.slice(0, 8).toUpperCase()}
                        </p>
                        {order.cashier && (
                          <p className="text-xs text-slate-500 truncate">{order.cashier.full_name}</p>
                        )}
                      </div>
                      <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium border ${badge.color}`}>
                        {badge.label}
                      </span>
                    </div>

                    {/* Articles aperçu */}
                    <div className="mt-2 space-y-1">
                      {order.items?.slice(0, 2).map((item) => (
                        <div key={item.id} className="flex items-center gap-1.5 text-xs text-slate-400">
                          <Package className="w-3 h-3 shrink-0" />
                          <span className="truncate flex-1">{item.name}</span>
                          <span className="text-slate-500 shrink-0">×{item.quantity}</span>
                        </div>
                      ))}
                      {(order.items?.length ?? 0) > 2 && (
                        <p className="text-xs text-slate-600">
                          +{order.items!.length - 2} article{order.items!.length - 2 > 1 ? 's' : ''}
                        </p>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-surface-border">
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <Clock className="w-3 h-3" />
                        {formatDistanceToNow(new Date(order.created_at), { addSuffix: true, locale: fr })}
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-slate-500">{itemCount} article{itemCount > 1 ? 's' : ''}</span>
                        <span className="text-sm font-bold text-brand-400 ml-2">
                          {formatCurrency(order.total, business?.currency)}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* ── Panneau vérification ── */}
      {selected ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <OrderVerification
            order={selected}
            currency={business?.currency ?? 'XOF'}
            onConfirm={handleConfirm}
            onClose={() => setSelected(null)}
          />
        </div>
      ) : (
        <div className="flex-1 hidden md:flex flex-col items-center justify-center text-slate-600 gap-3">
          <Truck className="w-16 h-16 opacity-20" />
          <p className="text-sm">Sélectionnez une commande pour démarrer la vérification</p>
        </div>
      )}
    </div>
  );
}
