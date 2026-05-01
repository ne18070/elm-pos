'use client';

import { Package, Plus, AlertTriangle, ChevronDown } from 'lucide-react';
import { useProducts } from '@/hooks/useProducts';
import { useCartStore } from '@/store/cart';
import { useNotificationStore } from '@/store/notifications';
import { formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { useEffect, useRef, useState, useMemo } from 'react';
import { VariantPicker } from './VariantPicker';
import type { Product, ProductVariant } from '@pos-types';

interface ProductGridProps {
  businessId: string;
  categoryId: string | null;
  search: string;
  view: 'grid' | 'list';
  onSelect: (product: Product) => void;
}

export function ProductGrid({ businessId, categoryId, search, view, onSelect }: ProductGridProps) {
  // realtime=true : abonnement Supabase pour les mises à jour de stock en direct
  const { products, loading, error } = useProducts(businessId, true);
  const { business } = useAuthStore();
  const { syncProductStock, items: cartItems, addItem } = useCartStore();
  const { warning, error: notifError } = useNotificationStore();

  // Point 8: Handle loading error
  useEffect(() => {
    if (error) {
      console.error('Failed to load products:', error);
      notifError('Erreur de chargement des produits');
    }
  }, [error, notifError]);

  // Propager les changements de stock Realtime vers les lignes du panier
  useEffect(() => {
    products.forEach((p) => {
      if (p.track_stock) {
        syncProductStock(p.id, p.stock, p.is_active);
      }
    });
  }, [products, syncProductStock]);

  // Produit en attente de sélection de variante
  const [pickerProduct, setPickerProduct] = useState<Product | null>(null);

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
    // Produit avec variantes —ouvrir le picker
    if (product.variants && product.variants.length > 0) {
      setPickerProduct(product);
      return;
    }
    addDirect(product);
  }

  function addDirect(product: Product, variant?: ProductVariant) {
    const result = addItem(product, variant);
    if (!result.ok) {
      warning(result.reason ?? 'Stock insuffisant');
      return;
    }
    onSelect(product);
  }

  // Point 10: Memoize filtered products
  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    return products.filter((p) => {
      const matchesCategory = !categoryId || p.category_id === categoryId;
      if (!matchesCategory) return false;
      
      if (!s) return true;
      
      return (
        p.name.toLowerCase().includes(s) ||
        p.barcode?.includes(s) ||
        p.sku?.toLowerCase().includes(s)
      );
    });
  }, [products, categoryId, search]);

  // Total base-units consumed in cart for a product (used for stock checks)
  // Memoized for performance in the loops
  const consumedMap = useMemo(() => {
    const map: Record<string, number> = {};
    cartItems.forEach(i => {
      map[i.product_id] = (map[i.product_id] || 0) + i.quantity * (i.stock_consumption ?? 1);
    });
    return map;
  }, [cartItems]);

  const qtyMap = useMemo(() => {
    const map: Record<string, number> = {};
    cartItems.forEach(i => {
      map[i.product_id] = (map[i.product_id] || 0) + i.quantity;
    });
    return map;
  }, [cartItems]);

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
      <div className="flex flex-col items-center justify-center py-20 text-content-primary">
        <Package className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-sm">Aucun produit trouvé</p>
      </div>
    );
  }

  // -- Helpers de stock ---------------------------------------------------------

  function stockState(product: Product) {
    if (!product.track_stock) return 'ok' as const;
    const consumed = consumedMap[product.id] || 0;
    const remaining = (product.stock ?? 0) - consumed;
    if (remaining <= 0) return 'out' as const;
    if (remaining <= 3) return 'low' as const;
    return 'ok' as const;
  }

  function stockLabel(product: Product): string | null {
    if (!product.track_stock) return null;
    const consumed = consumedMap[product.id] || 0;
    const remaining = (product.stock ?? 0) - consumed;
    if (remaining <= 0) return 'Épuisé';
    if (remaining <= 3) return `${remaining} restant${remaining > 1 ? 's' : ''}`;
    return null;
  }

  /* -- Vue Grille -- */
  if (view === 'grid') {
    return (
      <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {filtered.map((product) => {
          const state = stockState(product);
          const label = stockLabel(product);
          const disabled = state === 'out';
          const inCart = qtyMap[product.id] || 0;

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
                  <Package className="w-8 h-8 text-content-muted" />
                )}
                {state === 'out' && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-lg">
                    <span className="text-xs font-bold text-status-error">Épuisé</span>
                  </div>
                )}
                {state === 'low' && (
                  <div className="absolute top-1.5 right-1.5 bg-yellow-500 rounded-full w-2.5 h-2.5" />
                )}
                {/* Badge quantité en panier */}
                {inCart > 0 && (
                  <div className="absolute top-1.5 left-1.5 min-w-[1.25rem] h-5 px-1 rounded-full
                                  bg-brand-600 text-content-primary text-xs font-bold flex items-center justify-center">
                    {inCart}
                  </div>
                )}
              </div>

              {/* Nom */}
              <p className="text-sm font-medium text-content-primary line-clamp-2 leading-tight">
                {product.name}
              </p>

              {/* Prix + stock */}
              <div className="flex items-center justify-between mt-auto">
                <div>
                  <span className="text-content-brand font-bold text-sm">
                    {formatCurrency(product.price, business?.currency)}
                  </span>
                  {product.variants?.length > 0 && (
                    <p className="text-[10px] text-content-primary flex items-center gap-0.5 mt-0.5">
                      <ChevronDown className="w-3 h-3" />
                      {product.variants.length} variante{product.variants.length > 1 ? 's' : ''}
                    </p>
                  )}
                </div>
                {label && (
                  <span className={`text-xs font-medium ${
                    state === 'out' ? 'text-status-error' : 'text-status-warning'
                  }`}>
                    {label}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      {pickerProduct && (
        <VariantPicker
          product={pickerProduct}
          currency={business?.currency}
          consumedInCart={consumedMap[pickerProduct.id] || 0}
          onSelect={(variant) => addDirect(pickerProduct, variant)}
          onClose={() => setPickerProduct(null)}
        />
      )}
      </>
    );
  }

  /* -- Vue Liste -- */
  return (
    <>
    <div className="flex flex-col gap-1.5">
      {filtered.map((product) => {
        const state = stockState(product);
        const label = stockLabel(product);
        const disabled = state === 'out';
        const inCart = qtyMap[product.id] || 0;

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
            <div className="relative w-10 h-10 rounded-lg bg-surface-input flex items-center justify-center overflow-hidden shrink-0">
              {product.image_url ? (
                <img src={product.image_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <Package className="w-5 h-5 text-content-muted" />
              )}
              {inCart > 0 && (
                <div className="absolute -top-1.5 -right-1.5 min-w-[1.1rem] h-[1.1rem] px-0.5 rounded-full
                                bg-brand-600 text-content-primary text-[10px] font-bold flex items-center justify-center">
                  {inCart}
                </div>
              )}
            </div>

            {/* Infos */}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-content-primary text-sm truncate">{product.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {product.category && (
                  <span className="text-xs text-content-primary">{product.category.name}</span>
                )}
                {label && (
                  <span className={`text-xs font-medium flex items-center gap-0.5 ${
                    state === 'out' ? 'text-status-error' : 'text-status-warning'
                  }`}>
                    {state === 'low' && <AlertTriangle className="w-3 h-3" />}
                    {label}
                  </span>
                )}
              </div>
            </div>

            {/* Prix + bouton ajouter */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                <span className="text-content-brand font-bold text-sm">
                  {formatCurrency(product.price, business?.currency)}
                </span>
                {product.variants?.length > 0 && (
                  <p className="text-[10px] text-content-primary">
                    {product.variants.length} variante{product.variants.length > 1 ? 's' : ''}
                  </p>
                )}
              </div>
              {!disabled && (
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors
                                ${product.variants?.length > 0
                                  ? 'bg-amber-600 group-hover:bg-amber-500'
                                  : 'bg-brand-600 group-hover:bg-brand-500'}`}>
                  {product.variants?.length > 0
                    ? <ChevronDown className="w-4 h-4 text-content-primary" />
                    : <Plus className="w-4 h-4 text-content-primary" />}
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
    {pickerProduct && (
      <VariantPicker
        product={pickerProduct}
        currency={business?.currency}
        consumedInCart={consumedMap[pickerProduct.id] || 0}
        onSelect={(variant) => addDirect(pickerProduct, variant)}
        onClose={() => setPickerProduct(null)}
      />
    )}
    </>
  );
}


