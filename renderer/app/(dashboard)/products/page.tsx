'use client';
import { toUserError } from '@/lib/user-error';

import { useState } from 'react';
import { Plus, Search, Pencil, Trash2, Package, LayoutGrid, List, Barcode, Upload, Download, AlertTriangle, Share2, Copy, Check, ExternalLink } from 'lucide-react';
import { useProducts } from '@/hooks/useProducts';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { useLowStockAlerts, LOW_STOCK_THRESHOLD } from '@/hooks/useLowStockAlerts';
import { formatCurrency } from '@/lib/utils';
import { ProductModal } from '@/components/products/ProductModal';
import { ImportProductsModal } from '@/components/products/ImportProductsModal';
import { BarcodePrintModal } from '@/components/products/BarcodePrintModal';
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
  const [showBarcode, setShowBarcode] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [copied, setCopied] = useState(false);

  const { products, loading, refetch } = useProducts(business?.id ?? '');
  const { lowStock } = useLowStockAlerts(business?.id ?? '');

  const shopUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/boutique/${business?.id ?? ''}`
    : '';

  async function copyShopLink() {
    try {
      await navigator.clipboard.writeText(shopUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback : sélectionner le texte dans le modal
    }
  }

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
      <div className="px-4 py-3 sm:p-6 border-b border-surface-border">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
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
              onClick={() => setShowShare(true)}
              className="btn-secondary flex items-center gap-2"
              title="Partager ma boutique"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">Boutique</span>
            </button>
            <button
              onClick={() => setShowBarcode(true)}
              className="btn-secondary flex items-center gap-2"
              title="Imprimer codes-barres"
            >
              <Barcode className="w-4 h-4" />
              <span className="hidden sm:inline">Codes-barres</span>
            </button>
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-secondary" />
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
                  : 'text-content-secondary hover:text-white'
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
                  : 'text-content-secondary hover:text-white'
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
          <div className="mb-4 rounded-xl border border-status-warning bg-badge-warning p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-status-warning shrink-0" />
              <p className="text-sm font-semibold text-status-warning">
                {lowStock.length} article{lowStock.length > 1 ? 's' : ''} avec stock bas (≤ {LOW_STOCK_THRESHOLD})
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {lowStock.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setEditProduct(p)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors hover:bg-badge-warning ${
                    (p.stock ?? 0) === 0
                      ? 'border-status-error bg-badge-error text-status-error'
                      : 'border-status-warning bg-badge-warning text-status-warning'
                  }`}
                >
                  <span>{p.name}</span>
                  <span className={`font-bold ${(p.stock ?? 0) === 0 ? 'text-status-error' : 'text-status-warning'}`}>
                    {(p.stock ?? 0) === 0 ? 'RUPTURE' : `× ${p.stock}`}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-content-secondary text-center py-16">Chargement…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-content-secondary">
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
                  <p className="text-content-brand font-semibold mt-1 text-sm">
                    {formatCurrency(product.price, business?.currency)}
                  </p>
                  {product.track_stock && (
                    <p className={`text-xs mt-0.5 ${(product.stock ?? 0) > 0 ? 'text-content-secondary' : 'text-status-error font-medium'}`}>
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
                <tr className="text-left text-xs text-content-secondary uppercase tracking-wide">
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
                        <span className="text-xs text-content-secondary bg-surface-input px-2 py-1 rounded-lg">
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
                          <div className="flex items-center gap-1 text-xs text-content-secondary font-mono">
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
                            ? 'text-status-error'
                            : (product.stock ?? 0) <= 5
                            ? 'text-status-warning'
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
                      <span className="text-content-brand font-semibold text-sm">
                        {formatCurrency(product.price, business?.currency)}
                      </span>
                    </td>

                    {/* Statut actif */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${
                        product.is_active
                          ? 'bg-badge-success text-status-success border-status-success'
                          : 'bg-surface-card text-slate-500 border-slate-700'
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

      {showBarcode && (
        <BarcodePrintModal
          products={filtered}
          currency={business?.currency ?? 'XOF'}
          onClose={() => setShowBarcode(false)}
          onRefetch={refetch}
        />
      )}

      {/* ── Modal partage boutique ─────────────────────────────────────────── */}
      {showShare && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowShare(false)}>
          <div className="bg-surface-card border border-surface-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
              <div className="flex items-center gap-2">
                <Share2 className="w-5 h-5 text-content-brand" />
                <h3 className="font-semibold text-white">Partager ma boutique</h3>
              </div>
              <button onClick={() => setShowShare(false)} className="p-1.5 rounded-lg text-content-secondary hover:text-white hover:bg-surface-hover">
                <Trash2 className="w-4 h-4 sr-only" aria-hidden />
                <span className="text-content-secondary text-lg leading-none">×</span>
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm text-content-secondary">
                Partagez ce lien avec vos clients. Ils pourront consulter votre catalogue et passer commande directement.
              </p>

              {/* URL */}
              <div className="flex items-center gap-2 bg-surface-input rounded-xl border border-surface-border px-3 py-2.5">
                <ExternalLink className="w-4 h-4 text-slate-500 shrink-0" />
                <span className="flex-1 text-xs text-slate-300 truncate font-mono">{shopUrl}</span>
                <button
                  onClick={copyShopLink}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    copied
                      ? 'bg-badge-success text-status-success border border-status-success'
                      : 'bg-brand-600 hover:bg-brand-700 text-white'
                  }`}
                >
                  {copied ? <><Check className="w-3 h-3" />Copié !</> : <><Copy className="w-3 h-3" />Copier</>}
                </button>
              </div>

              {/* Partage WhatsApp */}
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Découvrez notre boutique en ligne et passez commande directement :\n${shopUrl}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-sm transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Partager sur WhatsApp
              </a>

              <p className="text-xs text-slate-500 text-center">
                Les clients peuvent commander et choisir : sur place, livraison, ou lien de paiement sécurisé.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
