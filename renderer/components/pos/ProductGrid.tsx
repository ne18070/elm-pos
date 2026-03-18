'use client';

import { Package, Plus, AlertTriangle } from 'lucide-react';
import { useProducts } from '@/hooks/useProducts';
import { useCartStore } from '@/store/cart';
import { useNotificationStore } from '@/store/notifications';
import { formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { useEffect, useRef } from 'react';
import type { Product } from '@pos-types';

interface ProductGridProps {
  businessId: string;
  categoryId: string | null;
  search: string;
  view: 'grid' | 'list';
  onSelect: (product: Product) => void;
}

export function ProductGrid({ businessId, categoryId, search, view, onSelect }: ProductGridProps) {
  // realtime=true : abonnement Supabase pour les mises à jour de stock en direct
  const { products, loading } = useProducts(businessId, true);
  const { business } = useAuthStore();
  const { syncProductStock } = useCartStore();
  const { warning } = useNotificationStore();

  // Propager les changements de stock Realtime vers les lignes du panier
  useEffect(() => {
    products.forEach((p) => {
      if (p.track_stock) {
        syncProductStock(p.id, p.stock, p.is_active);
      }
    });
  }, [products, syncProductStock]);

  // Quantité déjà dans le panier pour ce produit
  const { items: cartItems, addItem } = useCartStore();

  // Distingue tap vs scroll sur écran tactile
  const touchRef = useRef({ y: 0, scrolled: false });
  const tapHandlers = (product: Product) => ({
    onTouchStart: (e: React.TouchEvent) => {
      touchRef.current = { y: e.touches[0].clientY, scrolled: false };
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (Math.abs(e.touches[0].clientY - touchRef.current.y) > 8) {
        touchRef.current.scrolled = true;
      }
    },
    onClick: () => {
      if (touchRef.current.scrolled) return;
      handleSelect(product);
    },
  });

  function handleSelect(product: Product) {
    const result = addItem(product);
    if (!result.ok) {
      warning(result.reason ?? 'Stock insuffisant');
      return;
    }
    onSelect(product);
  }

  function qtyInCart(productId: string): number {
    return cartItems
      .filter((i) => i.product_id === productId)
      .reduce((s, i) => s + i.quantity, 0);
  }

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
    return view === 'grid' ? (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="aspect-square rounded-xl bg-surface-input animate-pulse" />
        ))}
      </div>
    ) : (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 rounded-xl bg-surface-input animate-pulse" />
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

  // ── Helpers de stock ─────────────────────────────────────────────────────────

  function stockState(product: Product) {
    if (!product.track_stock) return 'ok' as const;
    const inCart = qtyInCart(product.id);
    const remaining = (product.stock ?? 0) - inCart;
    if (remaining <= 0) return 'out' as const;
    if (remaining <= 3) return 'low' as const;
    return 'ok' as const;
  }

  function stockLabel(product: Product): string | null {
    if (!product.track_stock) return null;
    const inCart = qtyInCart(product.id);
    const remaining = (product.stock ?? 0) - inCart;
    if (remaining <= 0) return 'Épuisé';
    if (remaining <= 3) return `${remaining} restant${remaining > 1 ? 's' : ''}`;
    return null;
  }

  /* ── Vue Grille ── */
  if (view === 'grid') {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {filtered.map((product) => {
          const state = stockState(product);
          const label = stockLabel(product);
          const disabled = state === 'out';

          return (
            <button
              key={product.id}
              {...tapHandlers(product)}
              disabled={disabled}
              className={`group bg-surface-card rounded-xl p-3 text-left border
                         transition-all duration-150 flex flex-col gap-2
                         ${disabled
                           ? 'opacity-50 cursor-not-allowed border-surface-border'
                           : 'border-surface-border hover:border-brand-500 hover:shadow-glow active:scale-95'}`}
            >
              {/* Image */}
              <div className="aspect-square rounded-lg bg-surface-input flex items-center justify-center overflow-hidden relative">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                ) : (
                  <Package className="w-8 h-8 text-slate-600" />
                )}
                {state === 'out' && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-lg">
                    <span className="text-xs font-bold text-red-400">Épuisé</span>
                  </div>
                )}
                {state === 'low' && (
                  <div className="absolute top-1.5 right-1.5 bg-yellow-500 rounded-full w-2.5 h-2.5" />
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
                {label && (
                  <span className={`text-xs font-medium ${
                    state === 'out' ? 'text-red-400' : 'text-yellow-400'
                  }`}>
                    {label}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  /* ── Vue Liste ── */
  return (
    <div className="flex flex-col gap-1.5">
      {filtered.map((product) => {
        const state = stockState(product);
        const label = stockLabel(product);
        const disabled = state === 'out';

        return (
          <button
            key={product.id}
            {...tapHandlers(product)}
            disabled={disabled}
            className={`group w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left
                       transition-all duration-150
                       ${disabled
                         ? 'opacity-50 cursor-not-allowed border-surface-border bg-surface-card'
                         : 'border-surface-border bg-surface-card hover:border-brand-500 hover:bg-surface-hover active:scale-[0.99]'}`}
          >
            {/* Miniature */}
            <div className="w-10 h-10 rounded-lg bg-surface-input flex items-center justify-center overflow-hidden shrink-0">
              {product.image_url ? (
                <img src={product.image_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <Package className="w-5 h-5 text-slate-600" />
              )}
            </div>

            {/* Infos */}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-white text-sm truncate">{product.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {product.category && (
                  <span className="text-xs text-slate-500">{product.category.name}</span>
                )}
                {label && (
                  <span className={`text-xs font-medium flex items-center gap-0.5 ${
                    state === 'out' ? 'text-red-400' : 'text-yellow-400'
                  }`}>
                    {state === 'low' && <AlertTriangle className="w-3 h-3" />}
                    {label}
                  </span>
                )}
              </div>
            </div>

            {/* Prix + bouton ajouter */}
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-brand-400 font-bold text-sm">
                {formatCurrency(product.price, business?.currency)}
              </span>
              {!disabled && (
                <div className="w-8 h-8 rounded-lg bg-brand-600 group-hover:bg-brand-500
                               flex items-center justify-center transition-colors">
                  <Plus className="w-4 h-4 text-white" />
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
