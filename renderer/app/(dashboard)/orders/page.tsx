'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Search, Filter, RefreshCw, User, Printer, Loader2, MessageCircle, Upload, ChevronLeft, ChevronRight, Store, ShoppingBag } from 'lucide-react';
import { useOrders, useOrderTotals } from '@/hooks/useOrders';
import { usePermission } from '@/hooks/usePermission';
import { useUrlTab } from '@/hooks/useUrlTab';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { formatCurrency } from '@/lib/utils';
import { toUserError } from '@/lib/user-error';
import { generateOrdersHistoryReport, printHtml } from '@/lib/invoice-templates';
import { OrderDetail } from '@/components/orders/OrderDetail';
import { InvoiceModal } from '@/components/shared/InvoiceModal';
import { ImportOrdersModal } from '@/components/orders/ImportOrdersModal';
import { getOrderById, getOrders } from '@services/supabase/orders';
import { getResellers, type Reseller } from '@services/supabase/resellers';
import type { Order, OrderStatus } from '@pos-types';
import { Badge } from '@/components/ui/Badge';
import { getPaidAmount, isAcompte, isOnlineToCollect, orderStatusBadge } from '@/lib/order-payment';

// Vues de travail (onglets) : une question chacune. Le statut, le revendeur et
// les dates sont des filtres à côté, pas des onglets — l'ancienne barre de 8
// onglets mélangeait date, canal, reste à payer et statut, qui se recoupaient.
type ViewTab = 'today' | 'online' | 'acompte' | 'all';
type StatusFilter = 'tous' | OrderStatus;

const VIEW_LABELS: Record<ViewTab, string> = {
  today:   "Aujourd'hui",
  online:  'En ligne',
  acompte: 'Reste à payer',
  all:     'Toutes',
};
const VIEWS: ViewTab[] = ['today', 'online', 'acompte', 'all'];

const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  tous:      'Tous les statuts',
  paid:      'Payées',
  pending:   'En attente',
  cancelled: 'Annulées',
  refunded:  'Remboursées',
};
const STATUS_FILTERS = Object.keys(STATUS_FILTER_LABELS) as StatusFilter[];

/** Date du jour au format YYYY-MM-DD dans le fuseau local. */
function todayLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const PAGE_SIZE = 50;
// Plafond de sécurité de l'export "Imprimer l'historique". Au-delà, on prévient
// que le lot est tronqué plutôt que de laisser croire à un export exhaustif.
const HISTORY_PRINT_LIMIT = 5000;
// "Acompte" (commande partiellement payée) est désormais filtré/paginé/compté
// côté SQL via `orders.balance_due` + l'index partiel `idx_orders_acompte`
// (migration 112) — plus aucun chargement de lot en mémoire, cet onglet se
// comporte exactement comme les autres.

// Un utilisateur sans la permission `view_all_orders` (par défaut : le caissier)
// ne voit que SES propres ventes (cashier_id = son id) des
// RESTRICTED_WINDOW_DAYS derniers jours. Le filtre de dates est alors masqué et
// le plancher created_at est calculé côté serveur, non modifiable depuis l'UI.
const RESTRICTED_WINDOW_DAYS = 30;

export default function OrdersPage() {
  const { business, user } = useAuthStore();
  const { error: notifError, warning: notifWarn } = useNotificationStore();
  const canViewAllOrders = usePermission('view_all_orders');
  const restricted = !canViewAllOrders;
  const [tab, setTab]               = useUrlTab<ViewTab>('today', VIEWS);
  const [statusFilter, setStatusFilter] = useUrlTab<StatusFilter>('tous', STATUS_FILTERS, 'statut');
  const [selectedOrder, setSelectedOrder]   = useState<Order | null>(null);
  const [printOrder,    setPrintOrder]      = useState<Order | null>(null);
  const [search, setSearch]         = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dateFrom, setDateFrom]     = useState('');
  const [dateTo, setDateTo]         = useState('');
  const [resellerId, setResellerId] = useState('');
  const [resellers, setResellers]   = useState<Reseller[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [page, setPage]             = useState(1);
  const [printingHistory, setPrintingHistory] = useState(false);

  const isAcompteTab = tab === 'acompte';
  const isTodayTab   = tab === 'today';
  const isOnlineTab  = tab === 'online';
  // « Reste à payer » porte son propre critère (solde dû) : le statut n'y a pas de sens.
  const dbStatus = isAcompteTab || statusFilter === 'tous' ? undefined : statusFilter;
  // Commandes passées sur la boutique en ligne (web + appli ELM Boutique).
  const dbSource = isOnlineTab ? 'boutique' : undefined;
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
  // Les commandes boutique n'ont jamais de revendeur : le filtre est ignoré
  // (et masqué) sur l'onglet « En ligne ».
  const resellerOpt = resellerId && !isOnlineTab ? resellerId : undefined;
  const selectedReseller = resellerOpt ? resellers.find((r) => r.id === resellerOpt) : undefined;
  // Si le périmètre est restreint mais l'utilisateur pas encore chargé, on
  // désactive la requête (businessId vide) plutôt que de tout exposer.
  const effectiveBusinessId = restricted && !user?.id ? '' : (business?.id ?? '');

  // Remet la page à 1 dès qu'un filtre (onglet, recherche, dates, revendeur) change —
  // fait directement pendant le rendu (pattern React recommandé pour
  // "ajuster un state suite au changement d'un autre"), pas dans un
  // useEffect séparé : useOrders ci-dessous lit `page` dans CE MÊME rendu
  // pour construire son offset, donc un reset après coup (effect) laisserait
  // passer un premier fetch avec l'ancien offset avant de le corriger —
  // flash "aucune commande" et requête réseau doublée. Ajusté pendant le
  // rendu, useOrders ne voit jamais la valeur périmée.
  const filterKey = [tab, statusFilter, debouncedSearch, dateFrom, dateTo, resellerId];
  const prevFiltersRef = useRef(filterKey);
  let effectivePage = page;
  if (filterKey.some((v, i) => prevFiltersRef.current[i] !== v)) {
    prevFiltersRef.current = filterKey;
    if (page !== 1) { effectivePage = 1; setPage(1); }
  }

  // Liste principale : pagination réelle côté serveur pour TOUS les onglets,
  // "acompte" compris (filtré par `balance_due` en SQL — cf. migration 112).
  const { orders, count, loading, error, refetch, patchOrder } = useOrders(
    effectiveBusinessId,
    {
      status:      dbStatus,
      acompteOnly: isAcompteTab || undefined,
      source:      dbSource,
      resellerId:  resellerOpt,
      limit:       PAGE_SIZE,
      offset:      (effectivePage - 1) * PAGE_SIZE,
      search:      debouncedSearch,
      ...dateRange,
      ...scopeOpts,
    },
  );

  // Badge de comptage "acompte" — count exact côté serveur (index partiel), pas
  // de lignes rapatriées hormis la première. Indépendant de l'onglet actif et
  // de l'onglet "Aujourd'hui" ; suit le sélecteur de dates et le revendeur
  // s'ils sont renseignés.
  const { count: acompteCount } = useOrders(
    isAcompteTab ? '' : effectiveBusinessId,
    {
      acompteOnly: true,
      limit:       1,
      projection:  'list',
      dateFrom:    dateFrom || undefined,
      dateTo:      dateTo || undefined,
      resellerId:  resellerId || undefined,
      ...scopeOpts,
    },
  );
  const effectiveAcompteCount = isAcompteTab ? count : acompteCount;

  // Totaux de TOUTES les commandes filtrées (pas seulement la page affichée),
  // uniquement quand un filtre est actif : sur « Toutes » sans filtre, la somme
  // parcourrait tout l'historique pour un chiffre sans intérêt.
  // « Reste à payer » et « En ligne » sont des lots bornés : leur total (ce qui reste
  // à encaisser) est justement l'information utile.
  const hasFilter = Boolean(resellerOpt || debouncedSearch.trim() || isTodayTab || isAcompteTab || isOnlineTab
    || statusFilter !== 'tous' || dateFrom || dateTo);
  const { totals } = useOrderTotals(
    hasFilter ? effectiveBusinessId : '',
    {
      status:      dbStatus,
      acompteOnly: isAcompteTab || undefined,
      source:      dbSource,
      resellerId:  resellerOpt,
      search:      debouncedSearch,
      ...dateRange,
      ...scopeOpts,
    },
  );

  // Badge "En ligne" : commandes boutique encore en attente, toutes dates
  // confondues — elles réservent du stock tant qu'elles ne sont ni encaissées
  // ni annulées.
  const { count: onlinePendingCount } = useOrders(
    effectiveBusinessId,
    {
      source:     'boutique',
      status:     'pending',
      limit:      1,
      projection: 'list',
      ...scopeOpts,
    },
  );

  const pageCount   = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const currentPage = Math.min(effectivePage, pageCount);
  const totalCount  = count;

  // Débounce la recherche pour éviter une requête réseau à chaque frappe, et
  // n'interroge le serveur qu'à partir de 2 caractères : un terme d'1 seul
  // caractère (`%x%`) est le pattern ILIKE le moins sélectif possible — la
  // requête la plus coûteuse qu'on puisse lancer — pour un résultat de toute
  // façon inexploitable pour l'utilisateur.
  useEffect(() => {
    const trimmed = search.trim();
    if (trimmed.length === 1) return;
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Liste des revendeurs du filtre — le sélecteur reste masqué tant qu'elle
  // est vide (business sans module revendeurs).
  useEffect(() => {
    if (!business?.id) return;
    getResellers(business.id).then(setResellers).catch(() => setResellers([]));
  }, [business?.id]);

  // Réaligne `page` sur la dernière page réelle quand le jeu de résultats a
  // rétréci sans passer par un changement de filtre (refetch temps réel,
  // annulation d'une commande sur la dernière page…) — sinon la requête repart
  // avec un offset au-delà des données (page vide affichée « Page 2 / 2 ») et
  // les boutons de pagination travaillent sur une valeur périmée.
  useEffect(() => {
    if (!loading && page > pageCount) setPage(pageCount);
  }, [loading, page, pageCount]);

  // Anciens liens (?tab=paid, ?tab=pending…, avant la refonte des onglets) :
  // vue « Toutes » filtrée sur ce statut, pour que les favoris restent valides.
  useEffect(() => {
    const legacy = new URLSearchParams(window.location.search).get('tab');
    if (legacy && (['paid', 'pending', 'cancelled', 'refunded'] as string[]).includes(legacy)) {
      setTab('all');
      setStatusFilter(legacy as OrderStatus);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lecture unique au montage
  }, []);

  // Auto-sélection depuis l'URL (?order=<id>) — ex: lien depuis WhatsApp.
  // Fait un fetch direct par id plutôt que de chercher dans la page chargée :
  // la commande visée peut être sur n'importe quelle page/onglet.
  const orderParamHandledRef = useRef(false);
  useEffect(() => {
    if (orderParamHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('order');
    if (!orderId) return;
    // Attendre de connaître l'identité de l'utilisateur avant de décider si un
    // caissier restreint a le droit d'ouvrir cette facture (évite aussi de
    // relancer le fetch quand `user.id` passe de undefined à sa valeur).
    if (restricted && !user?.id) return;
    orderParamHandledRef.current = true;
    getOrderById(orderId).then((order) => {
      // Un caissier au périmètre restreint ne peut pas ouvrir la facture d'un
      // collègue via un lien direct (?order=…).
      if (restricted && order.cashier_id !== user?.id) return;
      setTab('all');
      setSelectedOrder(order);
    }).catch((err) => notifError(toUserError(err)));
  }, [restricted, user?.id, notifError]);

  const fmt = (n: number) => formatCurrency(n, business?.currency);

  // Imprime l'historique des factures correspondant aux filtres actuellement
  // affichés (onglet, recherche, dates) — pas seulement la page en cours :
  // on requête tout le lot correspondant (borné par un plafond de sécurité)
  // plutôt que les PAGE_SIZE lignes déjà chargées à l'écran.
  async function handlePrintHistory() {
    if (!business) return;
    setPrintingHistory(true);
    try {
      const { orders: list } = await getOrders(effectiveBusinessId, {
        status:      dbStatus,
        acompteOnly: isAcompteTab || undefined,
        source:      dbSource,
        resellerId:  resellerOpt,
        search:      debouncedSearch,
        limit:       HISTORY_PRINT_LIMIT,
        withCount:   false,
        // Rapport niveau commande uniquement : projection allégée pour tenir
        // sous le statement_timeout sur un gros historique.
        projection:  'list',
        ...dateRange,
        ...scopeOpts,
      });
      if (list.length >= HISTORY_PRINT_LIMIT) {
        notifWarn(`Historique limité aux ${HISTORY_PRINT_LIMIT} commandes les plus récentes — affinez les dates pour un export complet.`);
      }
      const periodLabel = isTodayTab
        ? `Aujourd'hui — ${format(new Date(), 'dd MMMM yyyy', { locale: fr })}`
        : (dateFrom || dateTo)
          ? `Du ${dateFrom ? format(new Date(dateFrom), 'dd/MM/yyyy') : '…'} au ${dateTo ? format(new Date(dateTo), 'dd/MM/yyyy') : '…'}`
          : 'Toute la période';
      printHtml(generateOrdersHistoryReport(list, business, {
        title: `Historique des factures — ${VIEW_LABELS[tab]}${dbStatus ? ` — ${STATUS_FILTER_LABELS[dbStatus]}` : ''}${selectedReseller ? ` — ${selectedReseller.name}` : ''}`,
        periodLabel,
      }));
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setPrintingHistory(false);
    }
  }

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
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrintHistory}
                disabled={printingHistory}
                className="btn-secondary h-10 min-w-10 justify-center flex items-center gap-1.5 text-sm disabled:opacity-60"
                title="Imprimer l'historique des factures affichées"
                aria-label="Imprimer l'historique des factures affichées"
              >
                {printingHistory ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                <span className="hidden sm:inline">Imprimer l&apos;historique</span>
              </button>
              <button onClick={() => setShowImport(true)} aria-label="Importer des commandes"
                className="btn-secondary h-10 min-w-10 justify-center flex items-center gap-1.5 text-sm">
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">Importer</span>
              </button>
              <button onClick={refetch} aria-label="Actualiser"
                className="btn-secondary h-10 min-w-10 justify-center flex items-center gap-1.5 text-sm">
                <RefreshCw className="w-4 h-4" />
                <span className="hidden sm:inline">Actualiser</span>
              </button>
            </div>
          </div>

          {/* Vues de travail */}
          <div className="flex items-center gap-1 bg-surface-input rounded-xl p-1 overflow-x-auto" role="tablist">
            {VIEWS.map((t) => {
              const badge = t === 'online' ? onlinePendingCount : t === 'acompte' ? effectiveAcompteCount : 0;
              const active = tab === t;
              return (
                <button
                  key={t}
                  role="tab"
                  aria-selected={active}
                  onClick={() => { setTab(t); if (t === 'today') { setDateFrom(''); setDateTo(''); } }}
                  className={`flex-1 sm:flex-none min-h-[40px] px-3 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    active ? 'bg-brand-600 text-white' : 'text-content-secondary hover:text-content-primary'
                  }`}
                >
                  {VIEW_LABELS[t]}
                  {badge > 0 && (
                    <span
                      title={t === 'online' ? 'Commandes en ligne à encaisser' : 'Ventes avec un reste à payer'}
                      className={`ml-1.5 inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-xs font-bold tabular-nums ${
                        active ? 'bg-white/25 text-white' : t === 'acompte' ? 'bg-badge-warning text-status-warning' : 'bg-badge-info text-status-info'
                      }`}
                    >
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Recherche */}
          <div className="flex gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-secondary" />
              <input
                type="text"
                placeholder="Rechercher par ID, nom ou téléphone client…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-10 w-full"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {!isAcompteTab && (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                aria-label="Filtrer par statut"
                className={`input h-10 w-auto text-sm ${statusFilter !== 'tous' ? 'border-brand-600 text-content-primary' : 'text-content-secondary'}`}
              >
                {STATUS_FILTERS.map((st) => <option key={st} value={st}>{STATUS_FILTER_LABELS[st]}</option>)}
              </select>
            )}
            {resellers.length > 0 && !isOnlineTab && (
              <div className="relative w-44 sm:w-56 shrink-0">
                <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-secondary pointer-events-none" />
                <select
                  value={resellerId}
                  onChange={(e) => setResellerId(e.target.value)}
                  aria-label="Filtrer par revendeur"
                  className={`input h-10 pl-9 w-full truncate text-sm ${resellerId ? 'border-brand-600 text-content-primary' : 'text-content-secondary'}`}
                >
                  <option value="">Tous les revendeurs</option>
                  {resellers.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}{r.is_active ? '' : ' (inactif)'}
                    </option>
                  ))}
                </select>
              </div>
            )}

          {/* Filtre de dates — masqué quand le périmètre est verrouillé sur les
              30 derniers jours du caissier (le choix de dates n'aurait aucun effet
              au-delà de cette fenêtre). */}
          {restricted ? (
            <p className="text-xs text-content-muted">
              Vos propres ventes des {RESTRICTED_WINDOW_DAYS} derniers jours.
            </p>
          ) : isTodayTab ? null : (
            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-1.5 text-xs text-content-secondary">
                Du
                <input
                  type="date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="input h-10 text-sm py-0"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-content-secondary">
                Au
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="input h-10 text-sm py-0"
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
          </div>

          {/* Totaux des commandes filtrées (toutes pages confondues) */}
          {hasFilter && totals && (
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-surface-card border border-surface-border rounded-xl px-3 py-2 min-w-0">
                <p className="text-xs text-content-secondary truncate">
                  Total · {totals.count} cmd{totals.count !== 1 ? 's' : ''}
                </p>
                <p className="text-base sm:text-lg font-bold text-content-primary truncate">{fmt(totals.total)}</p>
              </div>
              <div className="bg-surface-card border border-surface-border rounded-xl px-3 py-2 min-w-0">
                <p className="text-xs text-content-secondary truncate">Encaissé</p>
                <p className="text-base sm:text-lg font-bold text-status-success truncate">{fmt(totals.amountPaid)}</p>
              </div>
              <div className="bg-surface-card border border-surface-border rounded-xl px-3 py-2 min-w-0">
                <p className="text-xs text-content-secondary truncate">Reste dû</p>
                <p className={`text-base sm:text-lg font-bold truncate ${totals.balanceDue > 0.005 ? 'text-status-warning' : 'text-content-primary'}`}>
                  {fmt(totals.balanceDue)}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Tableau */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <table className="w-full">
              <tbody><SkeletonRows rows={8} cols={5} /></tbody>
            </table>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-32 text-content-secondary gap-2">
              <p className="text-status-error">Impossible de charger les commandes.</p>
              <button onClick={refetch} className="btn-secondary flex items-center gap-1.5 text-sm">
                <RefreshCw className="w-4 h-4" />
                Réessayer
              </button>
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-content-secondary">
              {isOnlineTab ? <ShoppingBag className="w-8 h-8 mb-2 opacity-40" /> : <Filter className="w-8 h-8 mb-2 opacity-40" />}
              <p>{isOnlineTab ? 'Aucune commande en ligne' : isAcompteTab ? 'Aucun reste à payer' : 'Aucune commande trouvée'}</p>
              {isAcompteTab && (
                <p className="text-xs text-content-muted mt-1 text-center px-4">
                  Les ventes réglées en partie (acompte, crédit) apparaissent ici jusqu&apos;à leur paiement complet.
                </p>
              )}
              {isOnlineTab && (
                <p className="text-xs text-content-muted mt-1 text-center px-4">
                  Les commandes passées sur votre boutique en ligne et l&apos;appli ELM Boutique apparaîtront ici.
                </p>
              )}
              {selectedReseller && (
                <button onClick={() => setResellerId('')} className="text-xs text-content-brand hover:underline mt-1">
                  Aucune commande pour {selectedReseller.name} — voir tous les revendeurs
                </button>
              )}
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
                {orders.map((order) => {
                  const partial   = isAcompte(order);
                  const toCollect = isOnlineToCollect(order);
                  const status    = orderStatusBadge(order);
                  const paidAmt   = getPaidAmount(order);
                  const remaining = order.total - paidAmt;
                  const qty       = order.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;

                  return (
                    <tr
                      key={order.id}
                      onClick={() => setSelectedOrder(order)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedOrder(order); } }}
                      tabIndex={0}
                      aria-selected={selectedOrder?.id === order.id}
                      className={`border-b border-surface-border hover:bg-surface-hover cursor-pointer transition-colors focus-visible:outline-none focus-visible:bg-surface-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500
                        ${selectedOrder?.id === order.id ? 'bg-surface-hover' : ''}
                        ${partial ? 'border-l-2 border-l-status-warning' : toCollect ? 'border-l-2 border-l-status-info' : ''}`}
                    >
                      <td className="px-3 py-2 font-mono text-xs text-content-primary whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {order.source === 'whatsapp' && (
                            <span title="Commande WhatsApp">
                              <MessageCircle className="w-3.5 h-3.5 text-status-success shrink-0" />
                            </span>
                          )}
                          {order.source === 'boutique' && (
                            <span title="Commande en ligne (boutique)">
                              <ShoppingBag className="w-3.5 h-3.5 text-brand-400 shrink-0" />
                            </span>
                          )}
                          #{order.id.slice(0, 8).toUpperCase()}
                        </div>
                        {/* Heure visible sur mobile (la colonne Date est masquée) */}
                        <p className="sm:hidden mt-0.5 font-sans text-xs text-content-muted">
                          {format(new Date(order.created_at), isTodayTab ? 'HH:mm' : 'dd MMM, HH:mm', { locale: fr })}
                        </p>
                      </td>

                      <td className="px-3 py-2 text-xs text-content-secondary whitespace-nowrap hidden sm:table-cell">
                        {format(new Date(order.created_at), 'dd MMM yyyy, HH:mm', { locale: fr })}
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
                            {order.source === 'whatsapp'
                              ? <p className="text-xs text-status-success pl-5 flex items-center gap-1"><MessageCircle className="w-3 h-3" />WhatsApp</p>
                              : order.source === 'boutique'
                              ? <p className="text-xs text-brand-400 pl-5 flex items-center gap-1"><ShoppingBag className="w-3 h-3" />En ligne</p>
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
                        {partial || (toCollect && paidAmt > 0.01) ? (
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
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && !error && orders.length > 0 && pageCount > 1 && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-surface-border">
            <p className="text-xs text-content-secondary">
              Page {currentPage} / {pageCount} · {totalCount} commande{totalCount !== 1 ? 's' : ''}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
                className="btn-secondary flex items-center gap-1 text-sm px-2 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Précédent</span>
              </button>
              <button
                onClick={() => setPage(Math.min(pageCount, currentPage + 1))}
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
