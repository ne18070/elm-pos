'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Search, Filter, RefreshCw } from 'lucide-react';
import { useOrders } from '@/hooks/useOrders';
import { useAuthStore } from '@/store/auth';
import { formatCurrency } from '@/lib/utils';
import { OrderDetail } from '@/components/orders/OrderDetail';
import type { Order, OrderStatus } from '@pos-types';

const STATUS_LABELS: Record<OrderStatus | 'all', string> = {
  all:       'Toutes',
  pending:   'En attente',
  paid:      'Payées',
  cancelled: 'Annulées',
  refunded:  'Remboursées',
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending:   'bg-yellow-500/20 text-yellow-400 border-yellow-700',
  paid:      'bg-green-500/20 text-green-400 border-green-700',
  cancelled: 'bg-red-500/20 text-red-400 border-red-700',
  refunded:  'bg-purple-500/20 text-purple-400 border-purple-700',
};

const TABS: Array<OrderStatus | 'all'> = ['all', 'paid', 'pending', 'cancelled', 'refunded'];

export default function OrdersPage() {
  const { business } = useAuthStore();
  const [status, setStatus] = useState<OrderStatus | 'all'>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [search, setSearch] = useState('');

  const { orders, loading, refetch } = useOrders(business?.id ?? '', {
    status: status === 'all' ? undefined : status,
  });

  const filtered = orders.filter(
    (o) =>
      !search ||
      o.id.toLowerCase().includes(search.toLowerCase()) ||
      o.cashier?.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-full overflow-hidden">
      {/* Liste */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-surface-border">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-white">Commandes</h1>
            <button onClick={refetch} className="btn-secondary flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Actualiser
            </button>
          </div>

          <div className="flex gap-3 flex-wrap">
            {/* Recherche */}
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher par ID ou caissier…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-10"
              />
            </div>

            {/* Filtres statut */}
            <div className="flex items-center gap-1 bg-surface-input rounded-xl p-1 flex-wrap">
              {TABS.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    status === s
                      ? 'bg-brand-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tableau */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-slate-400">
              Chargement…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-slate-400">
              <Filter className="w-8 h-8 mb-2 opacity-40" />
              <p>Aucune commande trouvée</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 bg-surface-card border-b border-surface-border z-10">
                <tr className="text-left text-xs text-slate-400 uppercase tracking-wide">
                  <th className="px-6 py-3">Commande</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Caissier</th>
                  <th className="px-6 py-3">Articles</th>
                  <th className="px-6 py-3">Total</th>
                  <th className="px-6 py-3">Statut</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => (
                  <tr
                    key={order.id}
                    onClick={() => setSelectedOrder(order)}
                    className={`border-b border-surface-border hover:bg-surface-hover cursor-pointer transition-colors
                      ${selectedOrder?.id === order.id ? 'bg-surface-hover' : ''}`}
                  >
                    <td className="px-6 py-4 font-mono text-sm text-slate-300">
                      #{order.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">
                      {format(new Date(order.created_at), 'dd MMM, HH:mm', { locale: fr })}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-300">
                      {order.cashier?.full_name ?? '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">
                      {order.items?.length ?? 0} article{(order.items?.length ?? 0) !== 1 ? 's' : ''}
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-white">
                      {formatCurrency(order.total, business?.currency)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-1 rounded-lg text-xs font-medium border ${STATUS_COLORS[order.status as OrderStatus]}`}>
                        {STATUS_LABELS[order.status as OrderStatus]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Panneau détail */}
      {selectedOrder && (
        <OrderDetail
          order={selectedOrder}
          currency={business?.currency ?? 'XOF'}
          onClose={() => setSelectedOrder(null)}
          onRefresh={() => { refetch(); setSelectedOrder(null); }}
        />
      )}
    </div>
  );
}
