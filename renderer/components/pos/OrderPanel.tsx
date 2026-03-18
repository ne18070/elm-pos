'use client';

import { useState } from 'react';
import { Minus, Plus, Trash2, ShoppingCart, Tag, X, Clock, AlertTriangle, Gift } from 'lucide-react';
import { useCartStore } from '@/store/cart';
import { useNotificationStore } from '@/store/notifications';
import { formatCurrency } from '@/lib/utils';
import { getProducts } from '@services/supabase/products';
import { CouponPicker } from './CouponPicker';
import { HoldModal } from './HoldModal';
import type { CartItem, Coupon } from '@pos-types';

interface OrderPanelProps {
  taxRate: number;
  currency: string;
  businessId: string;
  onCheckout: () => void;
  onShowHeld: () => void;
}

export function OrderPanel({ taxRate, currency, businessId, onCheckout, onShowHeld }: OrderPanelProps) {
  const {
    items, coupons, addCoupon, removeCoupon, addFreeItem, removeFreeItem,
    updateQuantity, removeItem,
    subtotal, discountAmount, taxAmount, total, itemCount,
    holdCurrentOrder, heldOrders,
  } = useCartStore();
  const { warning } = useNotificationStore();

  async function handleCouponAdd(c: Coupon) {
    addCoupon(c);
    if (c.type === 'free_item' && c.free_item_product_id) {
      try {
        const products = await getProducts(businessId);
        const freeProduct = products.find((p) => p.id === c.free_item_product_id);
        if (freeProduct) {
          const qty = c.free_item_quantity ?? 1;
          const result = addFreeItem(freeProduct, qty);
          if (!result.ok) warning(result.reason ?? 'Stock insuffisant pour l\'article offert');
        }
      } catch { /* silencieux */ }
    }
  }

  function handleCouponRemove(couponId: string) {
    const c = coupons.find((x) => x.id === couponId);
    if (c?.type === 'free_item' && c.free_item_product_id) {
      removeFreeItem(c.free_item_product_id);
    }
    removeCoupon(couponId);
  }

  const [showHoldModal, setShowHoldModal] = useState(false);
  const fmt = (n: number) => formatCurrency(n, currency);

  function handleQtyIncrease(item: CartItem) {
    const result = updateQuantity(item.product_id, item.variant_id, item.quantity + 1);
    if (!result.ok) warning(result.reason ?? 'Stock insuffisant');
  }

  function handleQtyDecrease(item: CartItem) {
    updateQuantity(item.product_id, item.variant_id, item.quantity - 1);
  }

  /** Calcule la consommation totale en stock de base pour un item à une quantité donnée */
  function totalConsumption(item: CartItem, qty: number): number {
    return qty * (item.stock_consumption ?? 1);
  }

  /** True si ajouter 1 de plus dépasserait le stock disponible */
  function atStockLimit(item: CartItem): boolean {
    if (!item.product?.track_stock) return false;
    return totalConsumption(item, item.quantity + 1) > (item.product.stock ?? 0);
  }

  /** True si la consommation actuelle dépasse le stock (cas où le stock a baissé en temps réel) */
  function overStock(item: CartItem): boolean {
    if (!item.product?.track_stock) return false;
    return totalConsumption(item, item.quantity) > (item.product.stock ?? 0);
  }

  // ── Panier vide ──────────────────────────────────────────────────────────────

  if (items.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between">
          <h2 className="font-semibold text-white text-sm">Nouvelle vente</h2>
          {heldOrders.length > 0 && (
            <button
              onClick={onShowHeld}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                         bg-brand-900/30 border border-brand-700 text-brand-400
                         hover:bg-brand-900/50 transition-colors text-xs font-medium"
            >
              <Clock className="w-3.5 h-3.5" />
              En attente
              <span className="bg-brand-600 text-white text-xs font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {heldOrders.length}
              </span>
            </button>
          )}
        </div>
        <div className="flex flex-col items-center justify-center flex-1 text-slate-500 gap-3 px-4">
          <ShoppingCart className="w-12 h-12 opacity-30" />
          <p className="text-sm text-center">Sélectionnez des produits pour démarrer une vente</p>
        </div>
      </div>
    );
  }

  // ── Panier avec articles ─────────────────────────────────────────────────────

  const hasOverStock = items.some(overStock);

  return (
    <>
      <div className="flex flex-col h-full">
        {/* En-tête */}
        <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between gap-2">
          <h2 className="font-semibold text-white shrink-0">
            Commande{' '}
            <span className="text-brand-400">({itemCount()} article{itemCount() > 1 ? 's' : ''})</span>
          </h2>
          <div className="flex items-center gap-2 ml-auto">
            {heldOrders.length > 0 && (
              <button
                onClick={onShowHeld}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg
                           bg-brand-900/30 border border-brand-700 text-brand-400
                           hover:bg-brand-900/50 transition-colors text-xs font-medium shrink-0"
              >
                <Clock className="w-3.5 h-3.5" />
                <span className="bg-brand-600 text-white text-xs font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {heldOrders.length}
                </span>
              </button>
            )}
            <button
              onClick={() => setShowHoldModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-surface-border
                         text-slate-400 hover:border-slate-500 hover:text-white transition-colors text-xs font-medium shrink-0"
            >
              <Clock className="w-3.5 h-3.5" />
              Attente
            </button>
          </div>
        </div>

        {/* Alerte globale surstock (stock changé en temps réel) */}
        {hasOverStock && (
          <div className="mx-4 mt-3 flex items-start gap-2 p-3 bg-red-900/20 border border-red-800
                          rounded-xl text-xs text-red-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
            <span>
              Le stock de certains articles a changé. Veuillez ajuster les quantités avant d'encaisser.
            </span>
          </div>
        )}

        {/* Liste des articles */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {items.map((item) => {
            const limited = atStockLimit(item);
            const over    = overStock(item);
            const stock   = item.product?.stock ?? 0;
            // Total consommé pour ce produit dans tout le panier (toutes lignes confondues)
            const totalConsumedForProduct = items
              .filter((i) => i.product_id === item.product_id)
              .reduce((s, i) => s + i.quantity * (i.stock_consumption ?? 1), 0);
            const remaining = stock - totalConsumedForProduct;

            return (
              <div
                key={`${item.product_id}::${item.variant_id ?? ''}`}
                className={`rounded-xl p-3 border transition-colors ${
                  over
                    ? 'bg-red-900/10 border-red-800'
                    : 'bg-surface-input border-transparent'
                }`}
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

                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleQtyDecrease(item)}
                      className="w-7 h-7 rounded-lg bg-surface-card flex items-center justify-center
                                 text-slate-400 hover:text-white hover:bg-brand-600 transition-colors"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className={`font-semibold w-6 text-center ${over ? 'text-red-400' : 'text-white'}`}>
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => handleQtyIncrease(item)}
                      disabled={limited}
                      className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors
                        ${limited
                          ? 'bg-surface-card text-slate-600 cursor-not-allowed'
                          : 'bg-surface-card text-slate-400 hover:text-white hover:bg-brand-600'}`}
                      title={limited ? `Stock max : ${stock}` : undefined}
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="text-right">
                    <span className="text-white font-bold block">{fmt(item.price * item.quantity)}</span>
                    {/* Indicateur stock */}
                    {item.product?.track_stock && (
                      <span className={`text-xs ${
                        over
                          ? 'text-red-400 font-medium'
                          : limited
                          ? 'text-yellow-400'
                          : 'text-slate-500'
                      }`}>
                        {over
                          ? `⚠ Max ${stock} ${item.product.unit ?? ''} en stock`.trim()
                          : limited
                          ? `Limite atteinte`
                          : `${remaining} restant${remaining > 1 ? 's' : ''}`}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Promotions */}
        <div className="px-4 py-2 border-t border-surface-border space-y-2">
          {/* Chips des coupons déjà appliqués */}
          {coupons.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {coupons.map((c) => (
                <div
                  key={c.id}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium
                    ${c.type === 'free_item'
                      ? 'bg-amber-900/30 border border-amber-700 text-amber-400'
                      : 'bg-green-900/30 border border-green-700 text-green-400'}`}
                >
                  {c.type === 'free_item'
                    ? <Gift className="w-3 h-3 shrink-0" />
                    : <Tag className="w-3 h-3 shrink-0" />}
                  <span>{c.code}</span>
                  <button
                    onClick={() => handleCouponRemove(c.id)}
                    className="opacity-70 hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Sélecteur de promotions */}
          <CouponPicker
            businessId={businessId}
            currency={currency}
            orderTotal={subtotal()}
            cartItemCount={itemCount()}
            selectedIds={coupons.map((c) => c.id)}
            onAdd={handleCouponAdd}
            onRemove={handleCouponRemove}
          />
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
            disabled={hasOverStock}
            className={`w-full h-12 text-base flex items-center justify-center gap-2 rounded-xl font-semibold transition-all
              ${hasOverStock
                ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                : 'btn-primary'}`}
          >
            {hasOverStock
              ? 'Ajustez les quantités'
              : `Encaisser · ${fmt(total(taxRate))}`}
          </button>
        </div>
      </div>

      {showHoldModal && (
        <HoldModal
          onConfirm={(label) => { holdCurrentOrder(label); }}
          onClose={() => setShowHoldModal(false)}
        />
      )}
    </>
  );
}
