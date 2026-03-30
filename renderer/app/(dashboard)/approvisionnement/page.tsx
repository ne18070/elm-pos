'use client';
import { toUserError } from '@/lib/user-error';

import { useState, useEffect, useCallback } from 'react';
import { Plus, RefreshCw, Package, TrendingUp, Search, Filter, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { formatCurrency } from '@/lib/utils';
import { getStockEntries } from '@services/supabase/stock';
import { StockEntryModal } from '@/components/stock/StockEntryModal';
import { useLowStockAlerts, LOW_STOCK_THRESHOLD } from '@/hooks/useLowStockAlerts';
import type { StockEntry } from '@services/supabase/stock';

export default function ApprovisionnementPage() {
  const { business } = useAuthStore();
  const { error: notifError } = useNotificationStore();

  const [entries, setEntries]       = useState<StockEntry[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [search, setSearch]         = useState('');

  const fetchEntries = useCallback(async (silent = false) => {
    if (!business?.id) return;
    if (!silent) setLoading(true);
    try {
      const data = await getStockEntries(business.id);
      setEntries(data);
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [business?.id]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const filtered = entries.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.product?.name.toLowerCase().includes(q) ||
      e.supplier?.toLowerCase().includes(q) ||
      e.notes?.toLowerCase().includes(q)
    );
  });

  // Stats rapides
  const totalEntries  = entries.length;
  const totalProducts = new Set(entries.map((e) => e.product_id)).size;
  const { lowStock } = useLowStockAlerts(business?.id ?? '');

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-surface-border space-y-4 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-brand-400" />
              Approvisionnements
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {totalEntries} entrée{totalEntries !== 1 ? 's' : ''} — {totalProducts} produit{totalProducts !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => fetchEntries(true)}
              className="btn-secondary p-2.5"
              title="Actualiser"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => { setShowModal(true); }}
              className="btn-primary flex items-center gap-2 h-10 px-4"
            >
              <Plus className="w-4 h-4" />
              Nouvel approvisionnement
            </button>
          </div>
        </div>

        {/* Alerte rupture de stock */}
        {lowStock.length > 0 && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-xl border border-red-800 bg-red-900/15 text-sm">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-300">
                {lowStock.filter((p) => (p.stock ?? 0) === 0).length > 0
                  ? `${lowStock.filter((p) => (p.stock ?? 0) === 0).length} produit(s) en rupture totale`
                  : `${lowStock.length} produit(s) avec stock bas (≤ ${LOW_STOCK_THRESHOLD})`}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {lowStock.slice(0, 3).map((p) => p.name).join(', ')}
                {lowStock.length > 3 ? ` et ${lowStock.length - 3} autres…` : ''}
              </p>
            </div>
          </div>
        )}

        {/* Recherche */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher par produit, fournisseur, notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10 w-full"
          />
        </div>
      </div>

      {/* Tableau */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
            Chargement…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-500 gap-3">
            <Filter className="w-10 h-10 opacity-30" />
            <p className="font-medium">
              {search ? 'Aucun résultat' : 'Aucun approvisionnement enregistré'}
            </p>
            {!search && (
              <button
                onClick={() => setShowModal(true)}
                className="btn-primary flex items-center gap-2 mt-2"
              >
                <Plus className="w-4 h-4" />
                Premier approvisionnement
              </button>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-surface-card border-b border-surface-border z-10">
              <tr className="text-left text-xs text-slate-400 uppercase tracking-wide">
                <th className="px-4 py-3 whitespace-nowrap">Date</th>
                <th className="px-4 py-3 whitespace-nowrap">Produit</th>
                <th className="px-4 py-3 whitespace-nowrap hidden lg:table-cell">Conditionnement</th>
                <th className="px-4 py-3 whitespace-nowrap">Qté reçue</th>
                <th className="px-4 py-3 whitespace-nowrap hidden md:table-cell">Fournisseur</th>
                <th className="px-4 py-3 whitespace-nowrap hidden sm:table-cell">Coût total</th>
                <th className="px-4 py-3 whitespace-nowrap hidden lg:table-cell">Par</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => {
                const unit      = entry.product?.unit ?? 'pièce';
                const totalCost = entry.cost_per_unit
                  ? entry.cost_per_unit * entry.quantity
                  : null;
                const hasPackaging = entry.packaging_qty && entry.packaging_size;

                return (
                  <tr
                    key={entry.id}
                    className="border-b border-surface-border hover:bg-surface-hover transition-colors"
                  >
                    {/* Date */}
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                      {format(new Date(entry.created_at), 'dd MMM yy', { locale: fr })}
                      <br />
                      <span className="text-slate-600">
                        {format(new Date(entry.created_at), 'HH:mm')}
                      </span>
                    </td>

                    {/* Produit */}
                    <td className="px-4 py-3 max-w-[180px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-surface-input flex items-center justify-center shrink-0">
                          <Package className="w-3.5 h-3.5 text-slate-500" />
                        </div>
                        <span className="text-sm font-medium text-white truncate">
                          {entry.product?.name ?? '—'}
                        </span>
                      </div>
                    </td>

                    {/* Conditionnement */}
                    <td className="px-4 py-3 text-sm text-slate-400 hidden lg:table-cell whitespace-nowrap">
                      {hasPackaging ? (
                        <span>
                          {entry.packaging_qty} {entry.packaging_unit ?? 'colis'} × {entry.packaging_size} {unit}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>

                    {/* Quantité reçue */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-sm font-bold text-green-400">
                        +{entry.quantity} {unit}
                      </span>
                    </td>

                    {/* Fournisseur */}
                    <td className="px-4 py-3 text-sm text-slate-400 hidden md:table-cell max-w-[140px]">
                      <span className="truncate block">{entry.supplier ?? <span className="text-slate-600">—</span>}</span>
                    </td>

                    {/* Coût total */}
                    <td className="px-4 py-3 text-sm hidden sm:table-cell whitespace-nowrap">
                      {totalCost != null ? (
                        <span className="text-white font-medium">
                          {formatCurrency(totalCost, business?.currency)}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>

                    {/* Créé par */}
                    <td className="px-4 py-3 text-xs text-slate-500 hidden lg:table-cell max-w-[120px]">
                      <span className="truncate block">
                        {(entry.creator as { full_name?: string } | null)?.full_name ?? '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <StockEntryModal
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); fetchEntries(true); }}
        />
      )}
    </div>
  );
}
