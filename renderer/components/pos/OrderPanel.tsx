'use client';

import { Minus, Plus, Trash2, ShoppingCart, Tag, X } from 'lucide-react';
import { useCartStore } from '@/store/cart';
import { formatCurrency } from '@/lib/utils';
import { CouponInput } from './CouponInput';

interface OrderPanelProps {
  taxRate: number;
  currency: string;
  businessId: string;
  onCheckout: () => void;
}

export function OrderPanel({ taxRate, currency, businessId, onCheckout }: OrderPanelProps) {
  const {
    items, coupon, setCoupon,
    updateQuantity, removeItem,
    subtotal, discountAmount, taxAmount, total, itemCount,
  } = useCartStore();

  const fmt = (n: number) => formatCurrency(n, currency);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3 px-4">
        <ShoppingCart className="w-12 h-12 opacity-30" />
        <p className="text-sm text-center">
          Sélectionnez des produits pour démarrer une vente
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* En-tête */}
      <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between">
        <h2 className="font-semibold text-white">
          Commande <span className="text-brand-400">({itemCount()} article{itemCount() > 1 ? 's' : ''})</span>
        </h2>
      </div>

      {/* Liste des articles */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {items.map((item) => (
          <div
            key={`${item.product_id}::${item.variant_id ?? ''}`}
            className="bg-surface-input rounded-xl p-3"
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{item.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">{fmt(item.price)} / unité</p>
              </div>
              <button
                onClick={() => removeItem(item.product_id, item.variant_id)}
                className="text-slate-500 hover:text-red-400 transition-colors shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* Quantité + sous-total */}
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateQuantity(item.product_id, item.variant_id, item.quantity - 1)}
                  className="w-7 h-7 rounded-lg bg-surface-card flex items-center justify-center
                             text-slate-400 hover:text-white hover:bg-brand-600 transition-colors"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="text-white font-semibold w-6 text-center">{item.quantity}</span>
                <button
                  onClick={() => updateQuantity(item.product_id, item.variant_id, item.quantity + 1)}
                  className="w-7 h-7 rounded-lg bg-surface-card flex items-center justify-center
                             text-slate-400 hover:text-white hover:bg-brand-600 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
              <span className="text-white font-bold">
                {fmt(item.price * item.quantity)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Coupon */}
      <div className="px-4 py-2 border-t border-surface-border">
        {coupon ? (
          <div className="flex items-center gap-2 bg-green-900/30 border border-green-700 rounded-xl px-3 py-2">
            <Tag className="w-4 h-4 text-green-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-green-400">{coupon.code}</p>
              <p className="text-xs text-green-600">
                -{coupon.type === 'percentage' ? `${coupon.value}%` : fmt(coupon.value)}
              </p>
            </div>
            <button onClick={() => setCoupon(null)} className="text-green-600 hover:text-green-400">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <CouponInput
            businessId={businessId}
            orderTotal={subtotal()}
            onApply={setCoupon}
          />
        )}
      </div>

      {/* Récapitulatif */}
      <div className="px-4 py-3 border-t border-surface-border space-y-1.5">
        <div className="flex justify-between text-sm text-slate-400">
          <span>Sous-total</span>
          <span>{fmt(subtotal())}</span>
        </div>
        {discountAmount() > 0 && (
          <div className="flex justify-between text-sm text-green-400">
            <span>Remise</span>
            <span>-{fmt(discountAmount())}</span>
          </div>
        )}
        {taxRate > 0 && (
          <div className="flex justify-between text-sm text-slate-400">
            <span>TVA ({taxRate}%)</span>
            <span>{fmt(taxAmount(taxRate))}</span>
          </div>
        )}
        <div className="flex justify-between text-lg font-bold text-white pt-1 border-t border-surface-border">
          <span>Total</span>
          <span className="text-brand-400">{fmt(total(taxRate))}</span>
        </div>
      </div>

      {/* Bouton paiement */}
      <div className="p-4 border-t border-surface-border">
        <button
          onClick={onCheckout}
          className="btn-primary w-full h-12 text-base flex items-center justify-center gap-2"
        >
          Encaisser · {fmt(total(taxRate))}
        </button>
      </div>
    </div>
  );
}
