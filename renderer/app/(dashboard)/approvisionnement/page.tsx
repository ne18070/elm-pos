'use client';
import { toUserError } from '@/lib/user-error';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, RefreshCw, Package, TrendingUp, Search, Filter,
  AlertTriangle, Download, Building2, ClipboardList,
} from 'lucide-react';
import { format, startOfDay, startOfWeek, startOfMonth } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { formatCurrency, cn } from '@/lib/utils';
import { getStockEntries } from '@services/supabase/stock';
import { getSuppliers } from '@services/supabase/suppliers';
import { getPurchaseOrders, updatePOStatus, receivePurchaseOrder } from '@services/supabase/purchase-orders';
import { StockEntryModal } from '@/components/stock/StockEntryModal';
import { POModal } from '@/components/stock/POModal';
import { SuppliersPanel } from '@/components/stock/SuppliersPanel';
import { useLowStockAlerts, LOW_STOCK_THRESHOLD } from '@/hooks/useLowStockAlerts';
import type { StockEntry } from '@services/supabase/stock';
import type { Supplier } from '@services/supabase/suppliers';
import type { PurchaseOrder, POStatus } from '@services/supabase/purchase-orders';

// --- Types -------------------------------------------------------------------

type PageTab   = 'historique' | 'commandes';
type Period    = 'all' | 'today' | 'week' | 'month';

const PERIOD_LABELS: Record<Period, string> = {
  all: 'Tout', today: "Auj.", week: 'Semaine', month: 'Mois',
};

const PO_STATUS_CFG: Record<POStatus, { label: string; color: string }> = {
  draft:     { label: 'Brouillon', color: 'bg-surface-input text-content-secondary border-surface-border' },
  ordered:   { label: 'Commandé',  color: 'bg-badge-brand text-content-brand border-brand-500/30' },
  received:  { label: 'Reçu',      color: 'bg-badge-success text-status-success border-status-success/30' },
  cancelled: { label: 'Annulé',    color: 'bg-badge-error text-status-error border-status-error/30' },
};

function cutoffForPeriod(period: Period): Date | null {
  if (period === 'all') return null;
  const now = new Date();
  if (period === 'today') return startOfDay(now);
  if (period === 'week')  return startOfWeek(now, { weekStartsOn: 1 });
  return startOfMonth(now);
}

// --- CSV export --------------------------------------------------------------

function exportCSV(entries: StockEntry[], currency?: string) {
  const headers = ['Date', 'Produit', 'Quantité', 'Unité', 'Fournisseur', 'Coût unitaire', 'Coût total', 'Notes'];
  const rows = entries.map(e => [
    format(new Date(e.created_at), 'dd/MM/yyyy HH:mm'),
    e.product?.name ?? '',
    e.quantity,
    e.product?.unit ?? 'pièce',
    e.supplier ?? '',
    e.cost_per_unit ?? '',
    e.cost_per_unit ? e.cost_per_unit * e.quantity : '',
    e.notes ?? '',
  ]);
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `approvisionnements_${format(new Date(), 'yyyy-MM-dd')}.csv`;
  a.click();
}

// --- Page --------------------------------------------------------------------

export default function ApprovisionnementPage() {
  const { business, user }       = useAuthStore();
  const { error: notifError, success: notifOk } = useNotificationStore();

  const [entries, setEntries]       = useState<StockEntry[]>([]);
  const [suppliers, setSuppliers]   = useState<Supplier[]>([]);
  const [orders, setOrders]         = useState<PurchaseOrder[]>([]);
  const [loading, setLoading]       = useState(true);

  const [activeTab, setActiveTab]   = useState<PageTab>('historique');
  const [showModal, setShowModal]   = useState(false);
  const [showPOModal, setShowPOModal] = useState(false);
  const [showSupplierPanel, setShowSupplierPanel] = useState(false);

  const [search, setSearch]         = useState('');
  const [period, setPeriod]         = useState<Period>('month');
  const [supplierFilter, setSupplierFilter] = useState('');

  const { lowStock } = useLowStockAlerts(business?.id ?? '');

  const fetchAll = useCallback(async (silent = false) => {
    if (!business?.id) return;
    if (!silent) setLoading(true);
    try {
      const [e, s, o] = await Promise.all([
        getStockEntries(business.id),
        getSuppliers(business.id),
        getPurchaseOrders(business.id),
      ]);
      setEntries(e);
      setSuppliers(s);
      setOrders(o);
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [business?.id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Stats
  const thisMonthEntries = useMemo(() => {
    const cutoff = startOfMonth(new Date());
    return entries.filter(e => new Date(e.created_at) >= cutoff);
  }, [entries]);

  const spendThisMonth = useMemo(() =>
    thisMonthEntries.reduce((s, e) => s + (e.cost_per_unit ? e.cost_per_unit * e.quantity : 0), 0),
    [thisMonthEntries]
  );

  const topSupplier = useMemo(() => {
    const counts: Record<string, number> = {};
    entries.forEach(e => { if (e.supplier) counts[e.supplier] = (counts[e.supplier] ?? 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return top ? { name: top[0], count: top[1] } : null;
  }, [entries]);

  const topProduct = useMemo(() => {
    const counts: Record<string, { name: string; count: number }> = {};
    entries.forEach(e => {
      if (e.product_id) {
        const name = e.product?.name ?? '?';
        if (!counts[e.product_id]) counts[e.product_id] = { name, count: 0 };
        counts[e.product_id].count++;
      }
    });
    return Object.values(counts).sort((a, b) => b.count - a.count)[0] ?? null;
  }, [entries]);

  const supplierOptions = useMemo(() =>
    Array.from(new Set(entries.map(e => e.supplier).filter(Boolean) as string[])).sort(),
    [entries]
  );

  // Filtered history list
  const filtered = useMemo(() => {
    const cutoff = cutoffForPeriod(period);
    let list = cutoff ? entries.filter(e => new Date(e.created_at) >= cutoff) : [...entries];
    if (supplierFilter) list = list.filter(e => e.supplier === supplierFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        e.product?.name.toLowerCase().includes(q) ||
        e.supplier?.toLowerCase().includes(q) ||
        e.notes?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [entries, period, supplierFilter, search]);

  const hasActiveFilter = search !== '' || supplierFilter !== '' || period !== 'all';

  const pendingOrders = orders.filter(o => o.status === 'draft' || o.status === 'ordered').length;

  async function handlePOStatus(order: PurchaseOrder, status: POStatus) {
    if (!business || !user) return;
    try {
      if (status === 'received') {
        await receivePurchaseOrder(business.id, order, user.id);
        notifOk(`Commande réceptionnée — stock mis à jour`);
      } else {
        await updatePOStatus(order.id, status);
      }
      fetchAll(true);
    } catch (err) {
      notifError(toUserError(err));
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="px-4 sm:px-6 py-4 border-b border-surface-border space-y-4 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-content-primary flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-content-brand" />
              Approvisionnements
            </h1>
            <p className="text-xs text-content-muted mt-0.5">
              {entries.length} entrée{entries.length !== 1 ? 's' : ''} — {new Set(entries.map(e => e.product_id)).size} produit{new Set(entries.map(e => e.product_id)).size !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => exportCSV(filtered, business?.currency)}
              className="btn-secondary p-2.5" title="Exporter CSV"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowSupplierPanel(true)}
              className="btn-secondary p-2.5" title="Gérer les fournisseurs"
            >
              <Building2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => fetchAll(true)}
              className="btn-secondary p-2.5" title="Actualiser"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => activeTab === 'commandes' ? setShowPOModal(true) : setShowModal(true)}
              className="btn-primary flex items-center gap-2 h-10 px-4"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">
                {activeTab === 'commandes' ? 'Nouvelle commande' : 'Nouvel approvisionnement'}
              </span>
              <span className="sm:hidden">Nouveau</span>
            </button>
          </div>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <div className="bg-surface-input rounded-xl p-3 border border-surface-border">
            <p className="text-[10px] text-content-muted uppercase tracking-wide font-semibold mb-1">Dépense ce mois</p>
            <p className="text-base font-black text-content-primary leading-tight truncate">
              {spendThisMonth > 0 ? formatCurrency(spendThisMonth, business?.currency) : '—'}
            </p>
            <p className="text-[10px] text-content-muted mt-0.5">{thisMonthEntries.length} entrée{thisMonthEntries.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="bg-surface-input rounded-xl p-3 border border-surface-border">
            <p className="text-[10px] text-content-muted uppercase tracking-wide font-semibold mb-1">Fournisseur principal</p>
            <p className="text-base font-black text-content-primary leading-tight truncate">
              {topSupplier?.name ?? '—'}
            </p>
            <p className="text-[10px] text-content-muted mt-0.5">
              {topSupplier ? `${topSupplier.count} commande${topSupplier.count > 1 ? 's' : ''}` : 'Aucun renseigné'}
            </p>
          </div>
          <div className="bg-surface-input rounded-xl p-3 border border-surface-border">
            <p className="text-[10px] text-content-muted uppercase tracking-wide font-semibold mb-1">Produit top</p>
            <p className="text-base font-black text-content-primary leading-tight truncate">
              {topProduct?.name ?? '—'}
            </p>
            <p className="text-[10px] text-content-muted mt-0.5">
              {topProduct ? `${topProduct.count} fois réapprovisionné` : 'Aucune entrée'}
            </p>
          </div>
          <div className={`rounded-xl p-3 border ${lowStock.length > 0 ? 'bg-badge-error border-status-error/30' : 'bg-surface-input border-surface-border'}`}>
            <p className="text-[10px] text-content-muted uppercase tracking-wide font-semibold mb-1">Stock bas</p>
            <p className={`text-base font-black leading-tight ${lowStock.length > 0 ? 'text-status-error' : 'text-content-primary'}`}>
              {lowStock.length > 0 ? lowStock.length : '—'}
            </p>
            <p className="text-[10px] text-content-muted mt-0.5">
              {lowStock.length === 0 ? 'Tout est OK' : `produit${lowStock.length > 1 ? 's' : ''} à réapprovisionner`}
            </p>
          </div>
        </div>

        {/* Low stock alert */}
        {lowStock.length > 0 && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-xl border border-status-error bg-badge-error text-sm">
            <AlertTriangle className="w-4 h-4 text-status-error shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-status-error">
                {lowStock.filter(p => (p.stock ?? 0) === 0).length > 0
                  ? `${lowStock.filter(p => (p.stock ?? 0) === 0).length} produit(s) en rupture totale`
                  : `${lowStock.length} produit(s) avec stock bas (≤ ${LOW_STOCK_THRESHOLD})`}
              </p>
              <p className="text-xs text-content-secondary mt-0.5">
                {lowStock.slice(0, 3).map(p => p.name).join(', ')}
                {lowStock.length > 3 ? ` et ${lowStock.length - 3} autres…` : ''}
              </p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b -mb-4 border-surface-border">
          {([
            { id: 'historique', icon: Package,      label: 'Historique', desc: 'Entrées de stock reçues',           badge: 0 },
            { id: 'commandes',  icon: ClipboardList, label: 'Commandes',  desc: 'Bons de commande fournisseur', badge: pendingOrders },
          ] as const).map(({ id, icon: Icon, label, desc, badge }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'relative px-4 py-2.5 text-left transition-colors flex items-start gap-2.5',
                activeTab === id
                  ? 'text-content-brand border-b-2 border-brand-500'
                  : 'text-content-secondary hover:text-content-primary'
              )}
            >
              <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold leading-tight flex items-center gap-1.5">
                  {label}
                  {badge > 0 && (
                    <span className="bg-brand-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full leading-none">
                      {badge}
                    </span>
                  )}
                </p>
                <p className="text-[11px] opacity-60 leading-tight mt-0.5 hidden sm:block">{desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* --- Historique tab --- */}
      {activeTab === 'historique' && (
        <>
          {/* Context hint */}
          <div className="px-4 sm:px-6 pt-3 pb-0 shrink-0">
            <p className="text-[11px] text-content-secondary flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 flex-shrink-0" />
              Chaque ligne est un approvisionnement reçu. Le stock produit est mis à jour automatiquement à chaque entrée.
            </p>
          </div>
          {/* Filters */}
          <div className="px-4 sm:px-6 pt-3 pb-3 flex flex-col sm:flex-row gap-2 shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-secondary" />
              <input type="text" placeholder="Produit, fournisseur, notes…"
                value={search} onChange={e => setSearch(e.target.value)}
                className="input pl-10 w-full" />
            </div>
            <div className="flex gap-1 bg-surface-input rounded-xl p-1 border border-surface-border shrink-0">
              {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    period === p ? 'bg-brand-500 text-white' : 'text-content-secondary hover:text-content-primary'
                  }`}
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
            {supplierOptions.length > 0 && (
              <select value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)}
                className="input shrink-0 text-sm"
              >
                <option value="">Tous les fournisseurs</option>
                {supplierOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-32 text-content-secondary text-sm">Chargement…</div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-content-primary gap-3">
                <Filter className="w-10 h-10 opacity-30" />
                <p className="font-medium">
                  {hasActiveFilter ? 'Aucun résultat pour ces filtres' : 'Aucun approvisionnement enregistré'}
                </p>
                {hasActiveFilter ? (
                  <button onClick={() => { setSearch(''); setSupplierFilter(''); setPeriod('all'); }}
                    className="btn-secondary text-sm">Effacer les filtres</button>
                ) : (
                  <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2 mt-2">
                    <Plus className="w-4 h-4" /> Premier approvisionnement
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Mobile cards */}
                <div className="md:hidden divide-y divide-surface-border">
                  {filtered.map(entry => {
                    const unit      = entry.product?.unit ?? 'pièce';
                    const totalCost = entry.cost_per_unit ? entry.cost_per_unit * entry.quantity : null;
                    const hasPack   = entry.packaging_qty && entry.packaging_size;
                    return (
                      <div key={entry.id} className="px-4 py-3 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-surface-input flex items-center justify-center shrink-0">
                              <Package className="w-4 h-4 text-content-brand" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-content-primary truncate">{entry.product?.name ?? '—'}</p>
                              {entry.supplier && <p className="text-xs text-content-muted truncate">{entry.supplier}</p>}
                            </div>
                          </div>
                          <span className="shrink-0 text-sm font-black text-status-success whitespace-nowrap">
                            +{entry.quantity} {unit}
                          </span>
                        </div>
                        <div className="flex items-center justify-between pl-10">
                          <div className="flex items-center gap-3">
                            {hasPack && (
                              <span className="text-[10px] text-content-muted">
                                {entry.packaging_qty} {entry.packaging_unit ?? 'colis'} × {entry.packaging_size} {unit}
                              </span>
                            )}
                            {totalCost != null && (
                              <span className="text-xs font-semibold text-content-primary">
                                {formatCurrency(totalCost, business?.currency)}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-content-muted">
                            {format(new Date(entry.created_at), 'dd MMM yy', { locale: fr })}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop table */}
                <table className="hidden md:table w-full">
                  <thead className="sticky top-0 bg-surface-card border-b border-surface-border z-10">
                    <tr className="text-left text-xs text-content-secondary uppercase tracking-wide">
                      <th className="px-4 py-3 whitespace-nowrap">Date</th>
                      <th className="px-4 py-3 whitespace-nowrap">Produit</th>
                      <th className="px-4 py-3 whitespace-nowrap hidden lg:table-cell">Conditionnement</th>
                      <th className="px-4 py-3 whitespace-nowrap">Qté reçue</th>
                      <th className="px-4 py-3 whitespace-nowrap">Fournisseur</th>
                      <th className="px-4 py-3 whitespace-nowrap">Coût total</th>
                      <th className="px-4 py-3 whitespace-nowrap hidden lg:table-cell">Par</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(entry => {
                      const unit      = entry.product?.unit ?? 'pièce';
                      const totalCost = entry.cost_per_unit ? entry.cost_per_unit * entry.quantity : null;
                      const hasPack   = entry.packaging_qty && entry.packaging_size;
                      return (
                        <tr key={entry.id} className="border-b border-surface-border hover:bg-surface-hover transition-colors">
                          <td className="px-4 py-3 text-xs text-content-secondary whitespace-nowrap">
                            {format(new Date(entry.created_at), 'dd MMM yy', { locale: fr })}
                            <br /><span className="text-content-muted">{format(new Date(entry.created_at), 'HH:mm')}</span>
                          </td>
                          <td className="px-4 py-3 max-w-[180px]">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-7 h-7 rounded-lg bg-surface-input flex items-center justify-center shrink-0">
                                <Package className="w-3.5 h-3.5 text-content-primary" />
                              </div>
                              <span className="text-sm font-medium text-content-primary truncate">{entry.product?.name ?? '—'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-content-secondary hidden lg:table-cell whitespace-nowrap">
                            {hasPack
                              ? <span>{entry.packaging_qty} {entry.packaging_unit ?? 'colis'} — {entry.packaging_size} {unit}</span>
                              : <span className="text-content-muted">—</span>}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-sm font-bold text-status-success">+{entry.quantity} {unit}</span>
                          </td>
                          <td className="px-4 py-3 text-sm text-content-secondary max-w-[140px]">
                            <span className="truncate block">{entry.supplier ?? <span className="text-content-muted">—</span>}</span>
                          </td>
                          <td className="px-4 py-3 text-sm whitespace-nowrap">
                            {totalCost != null
                              ? <span className="text-content-primary font-medium">{formatCurrency(totalCost, business?.currency)}</span>
                              : <span className="text-content-muted">—</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-content-primary hidden lg:table-cell max-w-[120px]">
                            <span className="truncate block">
                              {(entry.creator as { full_name?: string } | null)?.full_name ?? '—'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </>
      )}

      {/* --- Commandes tab --- */}
      {activeTab === 'commandes' && (
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
          <p className="text-[11px] text-content-secondary flex items-center gap-1 flex-wrap mb-4">
            <ClipboardList className="w-3.5 h-3.5 flex-shrink-0" />
            Flux&nbsp;:
            <span className="text-content-secondary font-semibold">Brouillon</span>
            <span>→</span>
            <span className="text-content-brand font-semibold">Commandé</span>
            <span>→</span>
            <span className="text-status-success font-semibold">Reçu</span>
            <span className="opacity-50 ml-1">· La réception met le stock à jour automatiquement</span>
          </p>
          {loading ? (
            <div className="flex items-center justify-center h-32 text-content-secondary text-sm">Chargement…</div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-content-muted gap-3">
              <ClipboardList className="w-10 h-10 opacity-30" />
              <p className="text-sm font-medium">Aucun bon de commande</p>
              <button onClick={() => setShowPOModal(true)} className="btn-primary flex items-center gap-2">
                <Plus className="w-4 h-4" /> Première commande
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map(order => {
                const cfg          = PO_STATUS_CFG[order.status];
                const supplierName = order.supplier_name ?? order.supplier?.name ?? '—';
                const itemCount    = order.items?.length ?? 0;
                const totalEstim   = order.items?.reduce((s, i) => s + i.quantity_ordered * (i.cost_per_unit ?? 0), 0) ?? 0;
                return (
                  <div key={order.id} className="bg-surface-card rounded-2xl border border-surface-border p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-content-primary text-sm">{supplierName}</p>
                          {order.reference && (
                            <span className="text-xs text-content-muted bg-surface-input px-2 py-0.5 rounded-full">
                              {order.reference}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-content-muted mt-0.5">
                          {itemCount} article{itemCount > 1 ? 's' : ''}
                          {totalEstim > 0 ? ` · ${formatCurrency(totalEstim, business?.currency)}` : ''}
                          {' · '}{format(new Date(order.created_at), 'dd MMM yy', { locale: fr })}
                        </p>
                        {order.notes && <p className="text-xs text-content-muted italic mt-0.5 truncate">{order.notes}</p>}
                        {/* Items preview */}
                        {order.items && order.items.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {order.items.slice(0, 4).map(item => (
                              <span key={item.id} className="text-[10px] bg-surface-input text-content-secondary px-2 py-0.5 rounded-full">
                                {item.product?.name ?? '?'} × {item.quantity_ordered}
                              </span>
                            ))}
                            {order.items.length > 4 && (
                              <span className="text-[10px] text-content-muted px-1">+{order.items.length - 4} autres</span>
                            )}
                          </div>
                        )}
                      </div>
                      <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-full border ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </div>

                    {/* Action buttons */}
                    {(order.status === 'draft' || order.status === 'ordered') && (
                      <div className="flex gap-2 pt-2 border-t border-surface-border">
                        {order.status === 'draft' && (
                          <button
                            onClick={() => handlePOStatus(order, 'ordered')}
                            className="flex-1 py-2 rounded-xl border border-brand-500/30 bg-badge-brand text-content-brand text-xs font-bold hover:bg-brand-500/20 transition-colors"
                          >
                            Marquer commandé
                          </button>
                        )}
                        {order.status === 'ordered' && (
                          <button
                            onClick={() => handlePOStatus(order, 'received')}
                            className="flex-1 py-2 rounded-xl border border-status-success/30 bg-badge-success text-status-success text-xs font-bold hover:bg-status-success/20 transition-colors"
                          >
                            Réceptionner
                          </button>
                        )}
                        <button
                          onClick={() => handlePOStatus(order, 'cancelled')}
                          className="px-3 py-2 rounded-xl border border-surface-border text-content-secondary text-xs font-bold hover:text-status-error hover:border-status-error/30 hover:bg-badge-error transition-colors"
                        >
                          Annuler
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showModal && (
        <StockEntryModal
          suppliers={suppliers}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); fetchAll(true); }}
        />
      )}
      {showPOModal && (
        <POModal
          suppliers={suppliers}
          onClose={() => setShowPOModal(false)}
          onSuccess={() => { setShowPOModal(false); fetchAll(true); }}
        />
      )}
      {showSupplierPanel && business?.id && (
        <SuppliersPanel
          businessId={business.id}
          suppliers={suppliers}
          onClose={() => setShowSupplierPanel(false)}
          onRefresh={() => fetchAll(true)}
        />
      )}
    </div>
  );
}
