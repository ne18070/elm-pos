'use client';

import { useState } from 'react';
import { Plus, Search, Pencil, Trash2, Package } from 'lucide-react';
import { useProducts } from '@/hooks/useProducts';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { formatCurrency } from '@/lib/utils';
import { ProductModal } from '@/components/products/ProductModal';
import { deleteProduct } from '../../../services/supabase/products';
import type { Product } from '../../../../types';

export default function ProductsPage() {
  const { business } = useAuthStore();
  const { notify } = useNotificationStore((s) => ({ notify: s }));
  const [search, setSearch] = useState('');
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { products, loading, refetch } = useProducts(business?.id ?? '');

  const filtered = products.filter(
    (p) =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.barcode?.includes(search) ||
      p.sku?.toLowerCase().includes(search.toLowerCase())
  );

  async function handleDelete(product: Product) {
    if (!confirm(`Delete "${product.name}"?`)) return;
    try {
      await deleteProduct(product.id);
      notify.success(`"${product.name}" deleted`);
      refetch();
    } catch (err) {
      notify.error(String(err));
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-surface-border">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-white">Products</h1>
          <button
            onClick={() => setShowCreate(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Product
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, SKU, or barcode..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="text-slate-400 text-center py-16">Loading products...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Package className="w-12 h-12 mb-3 opacity-30" />
            <p>No products found</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filtered.map((product) => (
              <div
                key={product.id}
                className="card p-4 flex flex-col gap-3 group"
              >
                {/* Image placeholder */}
                <div className="aspect-square rounded-lg bg-surface-input flex items-center justify-center text-3xl overflow-hidden">
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
                  <p className="font-medium text-white text-sm line-clamp-2">{product.name}</p>
                  {product.category && (
                    <p className="text-xs text-slate-500 mt-0.5">{product.category.name}</p>
                  )}
                  <p className="text-brand-400 font-semibold mt-1">
                    {formatCurrency(product.price, business?.currency)}
                  </p>
                  {product.track_stock && (
                    <p className={`text-xs mt-0.5 ${(product.stock ?? 0) > 0 ? 'text-slate-400' : 'text-red-400'}`}>
                      Stock: {product.stock ?? 0}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditProduct(product)}
                    className="flex-1 btn-secondary flex items-center justify-center gap-1 py-1.5 text-xs"
                  >
                    <Pencil className="w-3 h-3" />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(product)}
                    className="btn-danger flex items-center justify-center py-1.5 px-2"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Product modal */}
      {(showCreate || editProduct) && (
        <ProductModal
          product={editProduct}
          businessId={business?.id ?? ''}
          onClose={() => {
            setShowCreate(false);
            setEditProduct(null);
          }}
          onSaved={() => {
            setShowCreate(false);
            setEditProduct(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}
