'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Search, Filter, RefreshCw, User } from 'lucide-react';
import { useOrders } from '@/hooks/useOrders';
import { useAuthStore } from '@/store/auth';
import { formatCurrency } from '@/lib/utils';
import { OrderDetail } from '@/components/orders/OrderDetail';
import type { Order, OrderStatus } from '@pos-types';

type FilterTab = OrderStatus | 'all' | 'acompte';

const TAB_LABELS: Record<FilterTab, string> = {
  all:       'Toutes',
  paid:      'Payées',
  pending:   'En attente',
  acompte:   'Acomptes',
  cancelled: 'Annulées',
  refunded:  'Remboursées',
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending:   'bg-yellow-500/20 text-yellow-400 border-yellow-700',
  paid:      'bg-green-500/20 text-green-400 border-green-700',
  cancelled: 'bg-red-500/20 text-red-400 border-red-700',
  refunded:  'bg-purple-500/20 text-purple-400 border-purple-700',
};

const TABS: FilterTab[] = ['all', 'acompte', 'paid', 'pending', 'cancelled', 'refunded'];

function getPaidAmount(order: Order): number {
  return (order.payments ?? []).reduce((s, p) => s + p.amount, 0);
}

function isAcompte(order: Order): boolean {
  if (order.status === 'cancelled' || order.status === 'refunded') return false;
  return getPaidAmount(order) < order.total - 0.01;
}

export default function OrdersPage() {
  const { business } = useAuthStore();
  const [tab, setTab]               = useState<FilterTab>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [search, setSearch]         = useState('');

  // Pour le filtre "acompte", on charge tout puis on filtre côté client
  const dbStatus = tab === 'all' || tab === 'acompte' ? undefined : tab as OrderStatus;
  const { orders, loading, refetch } = useOrders(business?.id ?? '', { status: dbStatus });

  const filtered = orders.filter((o) => {
    // Filtre acompte
    if (tab === 'acompte' && !isAcompte(o)) return false;

    // Recherche : ID, caissier, nom ou téléphone client
    if (search) {
      const q = search.toLowerCase();
      return (
        o.id.toLowerCase().includes(q) ||
        o.cashier?.full_name?.toLowerCase().includes(q) ||
        o.customer_name?.toLowerCase().includes(q) ||
        o.customer_phone?.includes(q)
      );
    }
    return true;
  });

  // Compteur acomptes pour le badge
  const acompteCount = orders.filter(isAcompte).length;

  const fmt = (n: number) => formatCurrency(n, business?.currency);

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-surface-border space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-white">Commandes</h1>
            <button onClick={refetch} className="btn-secondary flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Actualiser
            </button>
          </div>

          {/* Recherche */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher par ID, caissier, nom client ou téléphone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10 w-full"
            />
          </div>

          {/* Onglets filtre */}
          <div className="flex items-center gap-1 bg-surface-input rounded-xl p-1 flex-wrap">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`relative px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  tab === t
                    ? t === 'acompte'
                      ? 'bg-amber-600 text-white'
                      : 'bg-brand-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {TAB_LABELS[t]}
                {/* Badge compteur acomptes */}
                {t === 'acompte' && acompteCount > 0 && (
                  <span className={`ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-xs font-bold ${
                    tab === 'acompte' ? 'bg-white/20 text-white' : 'bg-amber-600 text-white'
                  }`}>
                    {acompteCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tableau */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-slate-400">Chargement…</div>
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
                  <th className="px-6 py-3">Client / Caissier</th>
                  <th className="px-6 py-3">Articles</th>
                  <th className="px-6 py-3">Total</th>
                  <th className="px-6 py-3">Versé / Reste</th>
                  <th className="px-6 py-3">Statut</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => {
                  const partial   = isAcompte(order);
                  const paidAmt   = getPaidAmount(order);
                  const remaining = order.total - paidAmt;
                  const qty       = order.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;

                  return (
                    <tr
                      key={order.id}
                      onClick={() => setSelectedOrder(order)}
                      className={`border-b border-surface-border hover:bg-surface-hover cursor-pointer transition-colors
                        ${selectedOrder?.id === order.id ? 'bg-surface-hover' : ''}
                        ${partial ? 'border-l-2 border-l-amber-600' : ''}`}
                    >
                      <td className="px-6 py-4 font-mono text-sm text-slate-300">
                        #{order.id.slice(0, 8).toUpperCase()}
                      </td>

                      <td className="px-6 py-4 text-sm text-slate-400 whitespace-nowrap">
                        {format(new Date(order.created_at), 'dd MMM, HH:mm', { locale: fr })}
                      </td>

                      {/* Client + Caissier */}
                      <td className="px-6 py-4">
                        {order.customer_name ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <div className="w-5 h-5 rounded-full bg-amber-900/50 border border-amber-700 flex items-center justify-center shrink-0">
                                <User className="w-2.5 h-2.5 text-amber-400" />
                              </div>
                              <p className="text-sm font-semibold text-white">{order.customer_name}</p>
                            </div>
                            {order.customer_phone && (
                              <p className="text-xs text-amber-400 pl-6">{order.customer_phone}</p>
                            )}
                            <p className="text-xs text-slate-500 pl-6">via {order.cashier?.full_name ?? '—'}</p>
                          </div>
                        ) : (
                          <p className="text-sm text-slate-300">{order.cashier?.full_name ?? '—'}</p>
                        )}
                      </td>

                      <td className="px-6 py-4 text-sm text-slate-400">
                        {qty} article{qty !== 1 ? 's' : ''}
                      </td>

                      <td className="px-6 py-4 text-sm font-semibold text-white whitespace-nowrap">
                        {fmt(order.total)}
                      </td>

                      {/* Versé / Reste */}
                      <td className="px-6 py-4 text-sm">
                        {partial ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1 text-brand-400">
                              <span className="text-xs text-slate-500">versé</span>
                              <span className="font-medium">{fmt(paidAmt)}</span>
                            </div>
                            <div className="flex items-center gap-1 text-amber-400 font-semibold">
                              <span className="text-xs text-slate-500">reste</span>
                              <span>{fmt(remaining)}</span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>

                      {/* Statut */}
                      <td className="px-6 py-4">
                        {partial ? (
                          <span className="inline-flex px-2 py-1 rounded-lg text-xs font-medium border bg-amber-500/20 text-amber-400 border-amber-700">
                            Acompte
                          </span>
                        ) : (
                          <span className={`inline-flex px-2 py-1 rounded-lg text-xs font-medium border ${STATUS_COLORS[order.status as OrderStatus]}`}>
                            {TAB_LABELS[order.status as OrderStatus] ?? order.status}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
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
