'use client';

import { Package } from 'lucide-react';
import { useProducts } from '@/hooks/useProducts';
import { formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import type { Product } from '@pos-types';

interface ProductGridProps {
  businessId: string;
  categoryId: string | null;
  search: string;
  onSelect: (product: Product) => void;
}

export function ProductGrid({ businessId, categoryId, search, onSelect }: ProductGridProps) {
  const { products, loading } = useProducts(businessId);
  const { business } = useAuthStore();

  const filtered = products.filter((p) => {
    const matchesCategory = !categoryId || p.category_id === categoryId;
    const matchesSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.barcode?.includes(search) ||
      p.sku?.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="aspect-square rounded-xl bg-surface-input animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <Package className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-sm">Aucun produit trouvé</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {filtered.map((product) => (
        <button
          key={product.id}
          onClick={() => onSelect(product)}
          className="group bg-surface-card rounded-xl p-3 text-left border border-surface-border
                     hover:border-brand-500 hover:shadow-glow active:scale-95
                     transition-all duration-150 flex flex-col gap-2"
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
              <Package className="w-8 h-8 text-slate-600" />
            )}
          </div>

          {/* Nom */}
          <p className="text-sm font-medium text-white line-clamp-2 leading-tight">
            {product.name}
          </p>

          {/* Prix + stock */}
          <div className="flex items-center justify-between mt-auto">
            <span className="text-brand-400 font-bold text-sm">
              {formatCurrency(product.price, business?.currency)}
            </span>
            {product.track_stock && (
              <span className={`text-xs font-medium ${
                (product.stock ?? 0) > 0 ? 'text-slate-500' : 'text-red-500'
              }`}>
                {product.stock ?? 0} unités
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
