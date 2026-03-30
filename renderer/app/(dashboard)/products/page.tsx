'use client';
import { toUserError } from '@/lib/user-error';

import { useState } from 'react';
import { Plus, Search, Pencil, Trash2, Package, LayoutGrid, List, Barcode, Upload, Download, AlertTriangle } from 'lucide-react';
import { useProducts } from '@/hooks/useProducts';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { useLowStockAlerts, LOW_STOCK_THRESHOLD } from '@/hooks/useLowStockAlerts';
import { formatCurrency } from '@/lib/utils';
import { ProductModal } from '@/components/products/ProductModal';
import { ImportProductsModal } from '@/components/products/ImportProductsModal';
import { deleteProduct } from '@services/supabase/products';
import type { Product } from '@pos-types';

type ViewMode = 'grid' | 'list';

export default function ProductsPage() {
  const { business } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('list');
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const { products, loading, refetch } = useProducts(business?.id ?? '');
  const { lowStock } = useLowStockAlerts(business?.id ?? '');

  function exportCSV() {
    const headers = ['nom', 'description', 'prix', 'categorie', 'code_barres', 'sku', 'stock', 'suivre_stock', 'actif'];
    const rows = filtered.map((p) => [
      p.name,
      p.description ?? '',
      String(p.price),
      p.category?.name ?? '',
      p.barcode ?? '',
      p.sku ?? '',
      String(p.stock ?? ''),
      p.track_stock ? 'oui' : 'non',
      p.is_active ? 'oui' : 'non',
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `produits_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filtered = products.filter(
    (p) =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.barcode?.includes(search) ||
      p.sku?.toLowerCase().includes(search.toLowerCase())
  );

  async function handleDelete(product: Product, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Supprimer "${product.name}" ?`)) return;
    try {
      await deleteProduct(product.id);
      success(`"${product.name}" supprimé`);
      refetch();
    } catch (err) {
      notifError(toUserError(err));
    }
  }

  function handleEdit(product: Product, e: React.MouseEvent) {
    e.stopPropagation();
    setEditProduct(product);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-surface-border">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-white">Produits</h1>
            {!loading && (
              <p className="text-xs text-slate-500 mt-0.5">
                {filtered.length} produit{filtered.length !== 1 ? 's' : ''}
                {search && ` · filtrés sur ${products.length}`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportCSV}
              className="btn-secondary flex items-center gap-2"
              title="Exporter en CSV"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Exporter CSV</span>
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="btn-secondary flex items-center gap-2"
              title="Importer depuis CSV"
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Importer</span>
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="btn-primary flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Nouveau produit</span>
              <span className="sm:hidden">Nouveau</span>
            </button>
          </div>
        </div>

        <div className="flex gap-3">
          {/* Recherche */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Nom, SKU, code-barres…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10"
            />
          </div>

          {/* Toggle vue */}
          <div className="flex items-center gap-1 bg-surface-input rounded-xl p-1">
            <button
              onClick={() => setView('grid')}
              title="Vue grille"
              className={`p-2 rounded-lg transition-colors ${
                view === 'grid'
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('list')}
              title="Vue liste"
              className={`p-2 rounded-lg transition-colors ${
                view === 'list'
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Contenu */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Alertes stock bas */}
        {!loading && lowStock.length > 0 && (
          <div className="mb-4 rounded-xl border border-amber-800 bg-amber-900/15 p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <p className="text-sm font-semibold text-amber-300">
                {lowStock.length} article{lowStock.length > 1 ? 's' : ''} avec stock bas (≤ {LOW_STOCK_THRESHOLD})
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {lowStock.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setEditProduct(p)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors hover:bg-amber-900/30 ${
                    (p.stock ?? 0) === 0
                      ? 'border-red-800 bg-red-900/20 text-red-300'
                      : 'border-amber-800 bg-amber-900/20 text-amber-300'
                  }`}
                >
                  <span>{p.name}</span>
                  <span className={`font-bold ${(p.stock ?? 0) === 0 ? 'text-red-400' : 'text-amber-400'}`}>
                    {(p.stock ?? 0) === 0 ? 'RUPTURE' : `× ${p.stock}`}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-slate-400 text-center py-16">Chargement…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Package className="w-12 h-12 mb-3 opacity-30" />
            <p className="font-medium">Aucun produit trouvé</p>
            {!search && (
              <p className="text-sm mt-1">Cliquez sur "Nouveau produit" pour commencer.</p>
            )}
          </div>
        ) : view === 'grid' ? (
          /* ── Vue Grille ── */
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filtered.map((product) => (
              <div
                key={product.id}
                onClick={() => setEditProduct(product)}
                className="card p-4 flex flex-col gap-3 group cursor-pointer hover:border-brand-700 transition-colors"
              >
                {/* Image */}
                <div className="aspect-square rounded-lg bg-surface-input flex items-center justify-center overflow-hidden">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Package className="w-10 h-10 text-slate-600" />
                  )}
                </div>

                <div className="flex-1">
                  <p className="font-medium text-white text-sm line-clamp-2 leading-snug">
                    {product.name}
                  </p>
                  {product.category && (
                    <p className="text-xs text-slate-500 mt-0.5">{product.category.name}</p>
                  )}
                  <p className="text-brand-400 font-semibold mt-1 text-sm">
                    {formatCurrency(product.price, business?.currency)}
                  </p>
                  {product.track_stock && (
                    <p className={`text-xs mt-0.5 ${(product.stock ?? 0) > 0 ? 'text-slate-400' : 'text-red-400 font-medium'}`}>
                      Stock : {product.stock ?? 0}
                    </p>
                  )}
                </div>

                {/* Actions — visibles au hover */}
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => handleEdit(product, e)}
                    className="flex-1 btn-secondary flex items-center justify-center gap-1 py-1.5 text-xs"
                  >
                    <Pencil className="w-3 h-3" />
                    Modifier
                  </button>
                  <button
                    onClick={(e) => handleDelete(product, e)}
                    className="btn-danger flex items-center justify-center py-1.5 px-2"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* ── Vue Liste ── */
          <div className="rounded-xl border border-surface-border overflow-hidden">
            <table className="w-full">
              <thead className="bg-surface-card border-b border-surface-border">
                <tr className="text-left text-xs text-slate-400 uppercase tracking-wide">
                  <th className="px-4 py-3 w-12"></th>
                  <th className="px-4 py-3">Produit</th>
                  <th className="px-4 py-3 hidden md:table-cell">Catégorie</th>
                  <th className="px-4 py-3 hidden lg:table-cell">Code-barres / SKU</th>
                  <th className="px-4 py-3 hidden sm:table-cell">Stock</th>
                  <th className="px-4 py-3">Prix</th>
                  <th className="px-4 py-3 w-24">Statut</th>
                  <th className="px-4 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((product, i) => (
                  <tr
                    key={product.id}
                    onClick={() => setEditProduct(product)}
                    className={`border-b border-surface-border last:border-0 hover:bg-surface-hover
                      cursor-pointer transition-colors group
                      ${i % 2 === 0 ? '' : 'bg-surface-card/30'}`}
                  >
                    {/* Miniature */}
                    <td className="px-4 py-3">
                      <div className="w-10 h-10 rounded-lg bg-surface-input overflow-hidden flex items-center justify-center shrink-0">
                        {product.image_url ? (
                          <img src={product.image_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Package className="w-5 h-5 text-slate-600" />
                        )}
                      </div>
                    </td>

                    {/* Nom */}
                    <td className="px-4 py-3 max-w-[200px]">
                      <p className="font-medium text-white text-sm truncate">{product.name}</p>
                      {product.description && (
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{product.description}</p>
                      )}
                    </td>

                    {/* Catégorie */}
                    <td className="px-4 py-3 hidden md:table-cell">
                      {product.category ? (
                        <span className="text-xs text-slate-400 bg-surface-input px-2 py-1 rounded-lg">
                          {product.category.name}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>

                    {/* Barcode / SKU */}
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <div className="space-y-0.5">
                        {product.barcode && (
                          <div className="flex items-center gap-1 text-xs text-slate-400 font-mono">
                            <Barcode className="w-3 h-3 shrink-0" />
                            {product.barcode}
                          </div>
                        )}
                        {product.sku && (
                          <p className="text-xs text-slate-500 font-mono">{product.sku}</p>
                        )}
                        {!product.barcode && !product.sku && (
                          <span className="text-xs text-slate-600">—</span>
                        )}
                      </div>
                    </td>

                    {/* Stock */}
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {product.track_stock ? (
                        <span className={`text-sm font-medium ${
                          (product.stock ?? 0) === 0
                            ? 'text-red-400'
                            : (product.stock ?? 0) <= 5
                            ? 'text-yellow-400'
                            : 'text-slate-300'
                        }`}>
                          {product.stock ?? 0}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>

                    {/* Prix */}
                    <td className="px-4 py-3">
                      <span className="text-brand-400 font-semibold text-sm">
                        {formatCurrency(product.price, business?.currency)}
                      </span>
                    </td>

                    {/* Statut actif */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${
                        product.is_active
                          ? 'bg-green-900/20 text-green-400 border-green-800'
                          : 'bg-slate-800 text-slate-500 border-slate-700'
                      }`}>
                        {product.is_active ? 'Actif' : 'Inactif'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => handleEdit(product, e)}
                          className="btn-secondary p-1.5"
                          title="Modifier"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleDelete(product, e)}
                          className="btn-danger p-1.5"
                          title="Supprimer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(showCreate || editProduct) && (
        <ProductModal
          product={editProduct}
          businessId={business?.id ?? ''}
          onClose={() => { setShowCreate(false); setEditProduct(null); }}
          onSaved={() => { setShowCreate(false); setEditProduct(null); refetch(); }}
        />
      )}

      {showImport && (
        <ImportProductsModal
          businessId={business?.id ?? ''}
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); refetch(); }}
        />
      )}
    </div>
  );
}
