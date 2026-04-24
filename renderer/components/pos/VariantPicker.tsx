'use client';

import { X, Package } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { Product, ProductVariant } from '@pos-types';

interface VariantPickerProps {
  product: Product;
  currency?: string;
  /** Unités de base déjà consommées dans le panier pour ce produit */
  consumedInCart: number;
  onSelect: (variant: ProductVariant) => void;
  onClose: () => void;
}

export function VariantPicker({
  product,
  currency,
  consumedInCart,
  onSelect,
  onClose,
}: VariantPickerProps) {
  const stockRemaining = (product.stock ?? 0) - consumedInCart;

  function canAdd(variant: ProductVariant): boolean {
    if (!product.track_stock) return true;
    return stockRemaining >= (variant.stock_consumption ?? 1);
  }

  function stockLabel(variant: ProductVariant): string | null {
    if (!product.track_stock) return null;
    const consumption = variant.stock_consumption ?? 1;
    const maxQty = Math.floor(stockRemaining / consumption);
    if (maxQty <= 0) return 'Épuisé';
    if (maxQty <= 3) return `${maxQty} dispo`;
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full sm:max-w-sm bg-surface-card border border-surface-border
                      rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
        {/* Header produit */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-surface-border">
          <div className="w-12 h-12 rounded-xl bg-surface-input flex items-center justify-center overflow-hidden shrink-0">
            {product.image_url ? (
              <img src={product.image_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <Package className="w-6 h-6 text-content-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-content-primary truncate">{product.name}</p>
            <p className="text-xs text-content-secondary">Choisir une variante</p>
          </div>
          <button onClick={onClose} className="text-content-secondary hover:text-content-primary shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Liste des variantes */}
        <div className="p-3 space-y-2 max-h-72 overflow-y-auto">
          {product.variants.map((variant) => {
            const finalPrice = product.price + (variant.price_modifier ?? 0);
            const available  = canAdd(variant);
            const label      = stockLabel(variant);

            return (
              <button
                key={variant.id}
                onClick={() => { onSelect(variant); onClose(); }}
                disabled={!available}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border
                            transition-all text-left
                            ${available
                              ? 'border-surface-border hover:border-brand-500 hover:bg-surface-hover active:scale-[0.98]'
                              : 'border-surface-border opacity-40 cursor-not-allowed'}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Indicateur consommation */}
                  {product.track_stock && (
                    <div className="w-1.5 h-1.5 rounded-full shrink-0 mt-0.5
                                    bg-brand-400" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-content-primary">{variant.name}</p>
                    {product.track_stock && variant.stock_consumption && variant.stock_consumption !== 1 && (
                      <p className="text-xs text-content-primary">
                        {variant.stock_consumption} {product.unit ?? 'unité'}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {label && (
                    <span className={`text-xs font-medium ${
                      label === 'Épuisé' ? 'text-status-error' : 'text-status-warning'
                    }`}>
                      {label}
                    </span>
                  )}
                  <span className="font-bold text-content-brand text-sm">
                    {formatCurrency(finalPrice, currency)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Barre de swipe mobile */}
        <div className="sm:hidden h-5 flex items-center justify-center">
          <div className="w-10 h-1 rounded-full bg-slate-600" />
        </div>
      </div>
    </div>
  );
}


