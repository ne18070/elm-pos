'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, RefreshCw, Package, TrendingUp, Search, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { formatCurrency } from '@/lib/utils';
import { getStockEntries } from '@services/supabase/stock';
import { StockEntryModal } from '@/components/stock/StockEntryModal';
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
      notifError(String(err));
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
              onClick={() => setShowModal(true)}
              className="btn-primary flex items-center gap-2 h-10 px-4"
            >
              <Plus className="w-4 h-4" />
              Nouvel approvisionnement
            </button>
          </div>
        </div>

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
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Produit</th>
                <th className="px-6 py-3">Conditionnement</th>
                <th className="px-6 py-3">Quantité reçue</th>
                <th className="px-6 py-3">Fournisseur</th>
                <th className="px-6 py-3">Coût total</th>
                <th className="px-6 py-3">Par</th>
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
                    <td className="px-6 py-4 text-sm text-slate-400 whitespace-nowrap">
                      {format(new Date(entry.created_at), 'dd MMM yyyy', { locale: fr })}
                      <br />
                      <span className="text-xs text-slate-600">
                        {format(new Date(entry.created_at), 'HH:mm')}
                      </span>
                    </td>

                    {/* Produit */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-surface-input flex items-center justify-center shrink-0">
                          <Package className="w-4 h-4 text-slate-500" />
                        </div>
                        <span className="text-sm font-medium text-white">
                          {entry.product?.name ?? '—'}
                        </span>
                      </div>
                    </td>

                    {/* Conditionnement */}
                    <td className="px-6 py-4 text-sm text-slate-400">
                      {hasPackaging ? (
                        <span>
                          {entry.packaging_qty} {entry.packaging_unit ?? 'colis'} × {entry.packaging_size} {unit}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>

                    {/* Quantité reçue */}
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-green-400">
                        +{entry.quantity} {unit}
                      </span>
                    </td>

                    {/* Fournisseur */}
                    <td className="px-6 py-4 text-sm text-slate-400">
                      {entry.supplier ?? <span className="text-slate-600">—</span>}
                    </td>

                    {/* Coût total */}
                    <td className="px-6 py-4 text-sm">
                      {totalCost != null ? (
                        <span className="text-white font-medium">
                          {formatCurrency(totalCost, business?.currency)}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>

                    {/* Créé par */}
                    <td className="px-6 py-4 text-xs text-slate-500">
                      {(entry.creator as { full_name?: string } | null)?.full_name ?? '—'}
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
