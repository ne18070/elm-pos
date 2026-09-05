'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Search, Filter, RefreshCw, User, Printer, MessageCircle, Upload, ChevronLeft, ChevronRight, Store } from 'lucide-react';
import { useOrders } from '@/hooks/useOrders';
import { usePermission } from '@/hooks/usePermission';
import { useAuthStore } from '@/store/auth';
import { formatCurrency } from '@/lib/utils';
import { OrderDetail } from '@/components/orders/OrderDetail';
import { InvoiceModal } from '@/components/shared/InvoiceModal';
import { ImportOrdersModal } from '@/components/orders/ImportOrdersModal';
import { getOrderById } from '@services/supabase/orders';
import type { Order, OrderStatus } from '@pos-types';

type FilterTab = OrderStatus | 'all' | 'acompte' | 'today';

const TAB_LABELS: Record<FilterTab, string> = {
  today:     "Aujourd'hui",
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

const TABS: FilterTab[] = ['today', 'all', 'acompte', 'paid', 'pending', 'cancelled', 'refunded'];

/** Date du jour au format YYYY-MM-DD dans le fuseau local. */
function todayLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const PAGE_SIZE = 50;
// "Acompte" (paiement partiel) n'est pas une colonne en base — c'est calculé
// (payé < total) à partir des lignes payments de chaque commande. Impossible
// à filtrer/paginer côté SQL sans vue dédiée : on se limite donc aux
// ACOMPTE_FETCH_LIMIT commandes les plus récentes pour cet onglet et le badge
// de comptage, plutôt que de charger tout l'historique en mémoire.
const ACOMPTE_FETCH_LIMIT = 3000;

// Un utilisateur sans la permission `view_all_orders` (par défaut : le caissier)
// ne voit que SES propres ventes (cashier_id = son id) des
// RESTRICTED_WINDOW_DAYS derniers jours. Le filtre de dates est alors masqué et
// le plancher created_at est calculé côté serveur, non modifiable depuis l'UI.
const RESTRICTED_WINDOW_DAYS = 30;

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
  const canViewAllOrders = usePermission('view_all_orders');
  const restricted = !canViewAllOrders;
  const [tab, setTab]               = useState<FilterTab>('today');
  const [selectedOrder, setSelectedOrder]   = useState<Order | null>(null);
  const [printOrder,    setPrintOrder]      = useState<Order | null>(null);
  const [search, setSearch]         = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dateFrom, setDateFrom]     = useState('');
  const [dateTo, setDateTo]         = useState('');
  const [showImport, setShowImport] = useState(false);
  const [page, setPage]             = useState(1);

  const isAcompteTab = tab === 'acompte';
  const isTodayTab   = tab === 'today';
  const dbStatus = tab === 'all' || tab === 'today' || isAcompteTab ? undefined : tab as OrderStatus;
  // L'onglet "Aujourd'hui" force la plage sur la date du jour et ignore le
  // sélecteur de dates (masqué dans ce cas).
  const dateRange = isTodayTab
    ? { dateFrom: todayLocalISO(), dateTo: todayLocalISO() }
    : { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined };

  // Périmètre imposé au caissier : ses ventes uniquement, fenêtre glissante de
  // RESTRICTED_WINDOW_DAYS jours. `restrictedSince` figé au montage pour éviter
  // un nouvel objet d'options (et donc un refetch) à chaque rendu.
  const restrictedSince = useMemo(
    () => (restricted ? new Date(Date.now() - RESTRICTED_WINDOW_DAYS * 86_400_000).toISOString() : undefined),
    [restricted],
  );
  const scopeOpts = restricted ? { cashierId: user?.id, createdAfter: restrictedSince } : undefined;
  // Si le périmètre est restreint mais l'utilisateur pas encore chargé, on
  // désactive la requête (businessId vide) plutôt que de tout exposer.
  const effectiveBusinessId = restricted && !user?.id ? '' : (business?.id ?? '');

  // Remet la page à 1 dès qu'un filtre (onglet, recherche, dates) change —
  // fait directement pendant le rendu (pattern React recommandé pour
  // "ajuster un state suite au changement d'un autre"), pas dans un
  // useEffect séparé : useOrders ci-dessous lit `page` dans CE MÊME rendu
  // pour construire son offset, donc un reset après coup (effect) laisserait
  // passer un premier fetch avec l'ancien offset avant de le corriger —
  // flash "aucune commande" et requête réseau doublée. Ajusté pendant le
  // rendu, useOrders ne voit jamais la valeur périmée.
  const prevFiltersRef = useRef([tab, debouncedSearch, dateFrom, dateTo]);
  let effectivePage = page;
  if (
    prevFiltersRef.current[0] !== tab ||
    prevFiltersRef.current[1] !== debouncedSearch ||
    prevFiltersRef.current[2] !== dateFrom ||
    prevFiltersRef.current[3] !== dateTo
  ) {
    prevFiltersRef.current = [tab, debouncedSearch, dateFrom, dateTo];
    if (page !== 1) { effectivePage = 1; setPage(1); }
  }

  // Liste principale affichée : pagination réelle côté serveur pour les
  // onglets à statut direct. Pour "acompte" (calculé, non filtrable en SQL —
  // voir ACOMPTE_FETCH_LIMIT), on récupère un lot borné des commandes les
  // plus récentes et on filtre/pagine côté client à l'intérieur de ce lot.
  const { orders, count, loading, refetch, patchOrder } = useOrders(
    effectiveBusinessId,
    isAcompteTab
      ? { limit: ACOMPTE_FETCH_LIMIT, search: debouncedSearch, ...dateRange, ...scopeOpts }
      : { status: dbStatus, limit: PAGE_SIZE, offset: (effectivePage - 1) * PAGE_SIZE, search: debouncedSearch, ...dateRange, ...scopeOpts },
  );

  // Source dédiée au badge de comptage "acompte" — indépendante de l'onglet
  // actif, mais désactivée (businessId vide) quand l'onglet acompte est déjà
  // ouvert : `orders` ci-dessus sert alors directement de source, pas besoin
  // de la récupérer deux fois.
  // Le badge "acompte" reste indépendant de l'onglet "Aujourd'hui" : il suit le
  // sélecteur de dates s'il est renseigné, sinon toute la fenêtre récente.
  const { orders: acompteBadgeSource } = useOrders(
    isAcompteTab ? '' : effectiveBusinessId,
    { limit: ACOMPTE_FETCH_LIMIT, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, ...scopeOpts },
  );
  const acompteCount = (isAcompteTab ? orders : acompteBadgeSource).filter(isAcompte).length;

  // Sur l'onglet acompte, `orders` contient jusqu'à ACOMPTE_FETCH_LIMIT
  // commandes déjà filtrées par recherche côté serveur — reste à appliquer le
  // filtre acompte et la pagination localement. Sur les autres onglets, le
  // serveur a déjà renvoyé exactement la page demandée.
  const filtered  = isAcompteTab ? orders.filter(isAcompte) : orders;
  const pageCount = isAcompteTab ? Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)) : Math.max(1, Math.ceil(count / PAGE_SIZE));
  const currentPage = Math.min(effectivePage, pageCount);
  const paginated = isAcompteTab ? filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE) : filtered;
  const totalCount = isAcompteTab ? filtered.length : count;

  // Débounce la recherche pour éviter une requête réseau à chaque frappe.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Auto-sélection depuis l'URL (?order=<id>) — ex: lien depuis WhatsApp.
  // Fait un fetch direct par id plutôt que de chercher dans la page chargée :
  // la commande visée peut être sur n'importe quelle page/onglet.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('order');
    if (!orderId) return;
    getOrderById(orderId).then((order) => {
      // Un caissier au périmètre restreint ne peut pas ouvrir la facture d'un
      // collègue via un lien direct (?order=…).
      if (restricted && order.cashier_id !== user?.id) return;
      setTab('all');
      setSelectedOrder(order);
    }).catch(() => {});
  }, [restricted, user?.id]);

  const fmt = (n: number) => formatCurrency(n, business?.currency);

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-2 sm:p-4 border-b border-surface-border space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-content-primary flex items-center gap-2">
                Commandes
                <span className="text-xs font-medium text-content-secondary bg-surface-input rounded-full px-2 py-0.5">
                  {totalCount} commande{totalCount !== 1 ? 's' : ''}
                </span>
              </h1>
              <p className="text-xs text-content-secondary mt-0.5">
                {restricted
                  ? `Vos ventes des ${RESTRICTED_WINDOW_DAYS} derniers jours · "Acompte" = commande partiellement payée`
                  : 'Historique de toutes les ventes · "Acompte" = commande partiellement payée'}
              </p>
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
              placeholder="Rechercher par ID, nom ou téléphone client…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10 w-full"
            />
          </div>

          {/* Filtre de dates — masqué quand le périmètre est verrouillé sur les
              30 derniers jours du caissier (le choix de dates n'aurait aucun effet
              au-delà de cette fenêtre). */}
          {restricted ? (
            <p className="text-xs text-content-muted">
              Vous voyez uniquement vos propres ventes des {RESTRICTED_WINDOW_DAYS} derniers jours.
            </p>
          ) : isTodayTab ? (
            <p className="text-xs text-content-muted">
              Ventes du jour uniquement — choisissez « Toutes » pour filtrer par dates.
            </p>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-1.5 text-xs text-content-secondary">
                Du
                <input
                  type="date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="input h-8 text-sm py-0"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-content-secondary">
                Au
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="input h-8 text-sm py-0"
                />
              </label>
              {(dateFrom || dateTo) && (
                <button
                  onClick={() => { setDateFrom(''); setDateTo(''); }}
                  className="text-xs text-content-brand hover:underline"
                >
                  Réinitialiser
                </button>
              )}
            </div>
          )}

          {/* Onglets filtre */}
          <div className="flex items-center gap-1 bg-surface-input rounded-xl p-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); if (t === 'today') { setDateFrom(''); setDateTo(''); } }}
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
                  <th className="px-3 py-2 whitespace-nowrap">Commande</th>
                  <th className="px-3 py-2 whitespace-nowrap hidden sm:table-cell">Date</th>
                  <th className="px-3 py-2 whitespace-nowrap">Client / Revendeur</th>
                  <th className="px-3 py-2 whitespace-nowrap hidden md:table-cell">Articles</th>
                  <th className="px-3 py-2 whitespace-nowrap">Total</th>
                  <th className="px-3 py-2 whitespace-nowrap hidden lg:table-cell">Versé / Reste</th>
                  <th className="px-3 py-2 whitespace-nowrap">Statut</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((order) => {
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
                      <td className="px-3 py-2 font-mono text-xs text-content-primary whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {(order as { source?: string }).source === 'whatsapp' && (
                            <span title="Commande WhatsApp">
                              <MessageCircle className="w-3.5 h-3.5 text-status-success shrink-0" />
                            </span>
                          )}
                          #{order.id.slice(0, 8).toUpperCase()}
                        </div>
                      </td>

                      <td className="px-3 py-2 text-xs text-content-secondary whitespace-nowrap hidden sm:table-cell">
                        {format(new Date(order.created_at), 'dd MMM, HH:mm', { locale: fr })}
                      </td>

                      {/* Client + Revendeur + Caissier */}
                      <td className="px-3 py-2 max-w-[180px]">
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
                        {order.reseller && (
                          <div className="flex items-center gap-1.5 mt-1 min-w-0">
                            <Store className="w-3 h-3 text-brand-400 shrink-0" />
                            <span className="text-xs font-medium text-brand-400 truncate">
                              {order.reseller.name}
                              {order.reseller_client && <span className="text-content-muted"> · {order.reseller_client.name}</span>}
                            </span>
                          </div>
                        )}
                      </td>

                      <td className="px-3 py-2 text-sm text-content-secondary whitespace-nowrap hidden md:table-cell">
                        {qty} article{qty !== 1 ? 's' : ''}
                      </td>

                      <td className="px-3 py-2 text-sm font-semibold text-content-primary whitespace-nowrap">
                        {fmt(order.total)}
                      </td>

                      {/* Versé / Reste */}
                      <td className="px-3 py-2 text-sm hidden lg:table-cell whitespace-nowrap">
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
                      <td className="px-3 py-2">
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

        {/* Pagination */}
        {!loading && filtered.length > 0 && pageCount > 1 && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-surface-border">
            <p className="text-xs text-content-secondary">
              Page {currentPage} / {pageCount} · {totalCount} commande{totalCount !== 1 ? 's' : ''}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="btn-secondary flex items-center gap-1 text-sm px-2 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Précédent</span>
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={currentPage >= pageCount}
                className="btn-secondary flex items-center gap-1 text-sm px-2 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="hidden sm:inline">Suivant</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Panneau détail */}
      {selectedOrder && (
        <OrderDetail
          order={selectedOrder}
          currency={business?.currency ?? 'XOF'}
          onClose={() => setSelectedOrder(null)}
          // Attend que la liste soit effectivement rechargée avant de fermer
          // le panneau — sinon un clic rapide sur la même ligne pouvait
          // rouvrir l'ancien objet commande (acompte non soldé) le temps que
          // le refetch réseau se termine en arrière-plan.
          onRefresh={async () => { await refetch(); setSelectedOrder(null); }}
          // Reflète immédiatement un paiement encaissé dans la liste, sans
          // attendre le refetch (voir handleCompletePayment) — le refetch
          // déclenché juste après reste la source de vérité en arrière-plan.
          onOrderPatched={patchOrder}
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
