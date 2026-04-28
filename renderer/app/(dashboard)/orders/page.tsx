'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Search, Filter, RefreshCw, User, Printer, MessageCircle, Upload } from 'lucide-react';
import { useOrders } from '@/hooks/useOrders';
import { useAuthStore } from '@/store/auth';
import { formatCurrency } from '@/lib/utils';
import { OrderDetail } from '@/components/orders/OrderDetail';
import { InvoiceModal } from '@/components/shared/InvoiceModal';
import { ImportOrdersModal } from '@/components/orders/ImportOrdersModal';
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
  pending:   'bg-yellow-500/20 text-status-warning border-yellow-700',
  paid:      'bg-green-500/20 text-status-success border-status-success',
  cancelled: 'bg-red-500/20 text-status-error border-status-error',
  refunded:  'bg-purple-500/20 text-status-purple border-purple-700',
};

const TABS: FilterTab[] = ['all', 'acompte', 'paid', 'pending', 'cancelled', 'refunded'];

function getPaidAmount(order: Order): number {
  return (order.payments ?? []).reduce((s, p) => s + p.amount, 0);
}

function isAcompte(order: Order): boolean {
  if (order.status === 'cancelled' || order.status === 'refunded') return false;
  if ((order as { source?: string }).source === 'whatsapp') return false;
  return getPaidAmount(order) < order.total - 0.01;
}

export default function OrdersPage() {
  const { business, user } = useAuthStore();
  const [tab, setTab]               = useState<FilterTab>('all');
  const [selectedOrder, setSelectedOrder]   = useState<Order | null>(null);
  const [printOrder,    setPrintOrder]      = useState<Order | null>(null);
  const [search, setSearch]         = useState('');
  const [showImport, setShowImport] = useState(false);

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

  // Auto-sélection depuis l'URL (?order=<id>) — ex: lien depuis WhatsApp
  useEffect(() => {
    if (!orders.length) return;
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('order');
    if (!orderId) return;
    const order = orders.find((o) => o.id === orderId);
    if (order) {
      setTab('all');
      setSelectedOrder(order);
    }
  }, [orders]);

  const fmt = (n: number) => formatCurrency(n, business?.currency);

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 sm:p-6 border-b border-surface-border space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-content-primary">Commandes</h1>
              <p className="text-xs text-content-secondary mt-0.5">Historique de toutes les ventes · "Acompte" = commande partiellement payée</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowImport(true)} className="btn-secondary flex items-center gap-1.5 text-sm">
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">Importer</span>
              </button>
              <button onClick={refetch} className="btn-secondary flex items-center gap-1.5 text-sm">
                <RefreshCw className="w-4 h-4" />
                <span className="hidden sm:inline">Actualiser</span>
              </button>
            </div>
          </div>

          {/* Recherche */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-secondary" />
            <input
              type="text"
              placeholder="Rechercher par ID, caissier, nom client ou téléphone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10 w-full"
            />
          </div>

          {/* Onglets filtre */}
          <div className="flex items-center gap-1 bg-surface-input rounded-xl p-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`relative px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  tab === t
                    ? t === 'acompte'
                      ? 'bg-amber-600 text-content-primary'
                      : 'bg-brand-600 text-content-primary'
                    : 'text-content-secondary hover:text-content-primary'
                }`}
              >
                {TAB_LABELS[t]}
                {/* Badge compteur acomptes */}
                {t === 'acompte' && acompteCount > 0 && (
                  <span className={`ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-xs font-bold ${
                    tab === 'acompte' ? 'bg-white/20 text-content-primary' : 'bg-amber-600 text-content-primary'
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
            <div className="flex items-center justify-center h-32 text-content-secondary">Chargement…</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-content-secondary">
              <Filter className="w-8 h-8 mb-2 opacity-40" />
              <p>Aucune commande trouvée</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 bg-surface-card border-b border-surface-border z-10">
                <tr className="text-left text-xs text-content-secondary uppercase tracking-wide">
                  <th className="px-4 py-3 whitespace-nowrap">Commande</th>
                  <th className="px-4 py-3 whitespace-nowrap hidden sm:table-cell">Date</th>
                  <th className="px-4 py-3 whitespace-nowrap">Client / Caissier</th>
                  <th className="px-4 py-3 whitespace-nowrap hidden md:table-cell">Articles</th>
                  <th className="px-4 py-3 whitespace-nowrap">Total</th>
                  <th className="px-4 py-3 whitespace-nowrap hidden lg:table-cell">Versé / Reste</th>
                  <th className="px-4 py-3 whitespace-nowrap">Statut</th>
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
                      <td className="px-4 py-3 font-mono text-xs text-content-primary whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {(order as { source?: string }).source === 'whatsapp' && (
                            <span title="Commande WhatsApp">
                              <MessageCircle className="w-3.5 h-3.5 text-status-success shrink-0" />
                            </span>
                          )}
                          #{order.id.slice(0, 8).toUpperCase()}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-xs text-content-secondary whitespace-nowrap hidden sm:table-cell">
                        {format(new Date(order.created_at), 'dd MMM, HH:mm', { locale: fr })}
                      </td>

                      {/* Client + Caissier */}
                      <td className="px-4 py-3 max-w-[180px]">
                        {order.customer_name ? (
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <div className="w-4 h-4 rounded-full bg-badge-warning border border-status-warning flex items-center justify-center shrink-0">
                                <User className="w-2 h-2 text-status-warning" />
                              </div>
                              <p className="text-sm font-semibold text-content-primary truncate">{order.customer_name}</p>
                            </div>
                            {order.customer_phone && (
                              <p className="text-xs text-status-warning pl-5 truncate">{order.customer_phone}</p>
                            )}
                            {(order as { source?: string }).source === 'whatsapp'
                              ? <p className="text-xs text-status-success pl-5 flex items-center gap-1"><MessageCircle className="w-3 h-3" />WhatsApp</p>
                              : <p className="text-xs text-content-muted pl-5 truncate">via {order.cashier?.full_name ?? '—'}</p>
                            }
                          </div>
                        ) : (
                          <p className="text-sm text-content-primary truncate">{order.cashier?.full_name ?? '—'}</p>
                        )}
                      </td>

                      <td className="px-4 py-3 text-sm text-content-secondary whitespace-nowrap hidden md:table-cell">
                        {qty} article{qty !== 1 ? 's' : ''}
                      </td>

                      <td className="px-4 py-3 text-sm font-semibold text-content-primary whitespace-nowrap">
                        {fmt(order.total)}
                      </td>

                      {/* Versé / Reste */}
                      <td className="px-4 py-3 text-sm hidden lg:table-cell whitespace-nowrap">
                        {partial ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1 text-content-brand">
                              <span className="text-xs text-content-muted">versé</span>
                              <span className="font-medium">{fmt(paidAmt)}</span>
                            </div>
                            <div className="flex items-center gap-1 text-status-warning font-semibold">
                              <span className="text-xs text-content-muted">reste</span>
                              <span>{fmt(remaining)}</span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-content-muted">—</span>
                        )}
                      </td>

                      {/* Statut */}
                      <td className="px-4 py-3">
                        {partial ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium border bg-amber-500/20 text-status-warning border-status-warning whitespace-nowrap">
                            Acompte
                          </span>
                        ) : (
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${STATUS_COLORS[order.status as OrderStatus]}`}>
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
          onPrint={(o) => setPrintOrder(o)}
        />
      )}

      {/* Modal impression */}
      {printOrder && (
        <InvoiceModal order={printOrder} onClose={() => setPrintOrder(null)} />
      )}
      {showImport && business && user && (
        <ImportOrdersModal
          businessId={business.id}
          userId={user.id}
          onClose={() => setShowImport(false)}
          onDone={() => { refetch(); }}
        />
      )}
    </div>
  );
}
