'use client';

import { useState, useEffect, useRef } from 'react';
import { Minus, Plus, Trash2, ShoppingCart, Tag, X, Clock, AlertTriangle, Gift, Store, User, Search } from 'lucide-react';
import { useCartStore } from '@/store/cart';
import { useNotificationStore } from '@/store/notifications';
import { formatCurrency } from '@/lib/utils';
import { getProducts } from '@services/supabase/products';
import { getClients, type Client } from '@services/supabase/clients';
import { CouponPicker } from './CouponPicker';
import { HoldModal } from './HoldModal';
import { WholesaleSelector } from './WholesaleSelector';
import type { WholesaleContext } from './WholesaleSelector';
import type { CartItem, Coupon } from '@pos-types';

export interface SelectedClient {
  id: string;
  name: string;
  phone?: string | null;
}

interface OrderPanelProps {
  taxRate: number;
  taxInclusive: boolean;
  currency: string;
  businessId: string;
  onCheckout: () => void;
  onShowHeld: () => void;
  wholesaleCtx?: WholesaleContext | null;
  onWholesaleChange?: (ctx: WholesaleContext | null) => void;
  selectedClient?: SelectedClient | null;
  onClientChange?: (client: SelectedClient | null) => void;
}

export function OrderPanel({ taxRate, taxInclusive, currency, businessId, onCheckout, onShowHeld, wholesaleCtx, onWholesaleChange, selectedClient, onClientChange }: OrderPanelProps) {
  const {
    items, coupons, addCoupon, removeCoupon, addFreeItem, removeFreeItem,
    updateQuantity, removeItem, resetPriceOverrides,
    subtotal, discountAmount, taxAmount, total, itemCount,
    holdCurrentOrder, heldOrders,
  } = useCartStore();
  const { warning } = useNotificationStore();
  const [showWholesale, setShowWholesale] = useState(false);

  // ── Sélecteur client ─────────────────────────────────────────────────────────
  const [clientSearch, setClientSearch]   = useState('');
  const [clientList, setClientList]       = useState<Client[]>([]);
  const [showClientDrop, setShowClientDrop] = useState(false);
  const clientRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (clientRef.current && !clientRef.current.contains(e.target as Node)) {
        setShowClientDrop(false);
        setClientSearch('');
      }
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  async function openClientPicker() {
    if (!showClientDrop) {
      try {
        const list = await getClients(businessId);
        setClientList(list);
      } catch { /* silencieux */ }
    }
    setShowClientDrop((v) => !v);
    setClientSearch('');
  }

  const filteredClients = clientSearch.trim()
    ? clientList.filter((c) =>
        c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
        (c.phone ?? '').includes(clientSearch)
      )
    : clientList;

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
            {/* Bouton mode grossiste */}
            <button
              onClick={() => setShowWholesale(true)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-colors text-xs font-medium shrink-0
                ${wholesaleCtx
                  ? 'border-amber-600 bg-amber-900/20 text-amber-400'
                  : 'border-surface-border text-slate-400 hover:border-amber-600 hover:text-amber-400'}`}
            >
              <Store className="w-3.5 h-3.5" />
              {wholesaleCtx ? wholesaleCtx.reseller.name : 'Gros'}
            </button>

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
                className={`rounded-xl p-3 border transition-colors animate-cart-item ${
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

        {/* Bannière grossiste active */}
        {wholesaleCtx && (
          <div className="mx-4 mb-2 px-3 py-2 rounded-xl bg-amber-900/20 border border-amber-800 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-amber-400 flex items-center gap-1">
                <Store className="w-3 h-3" /> Prix de gros — {wholesaleCtx.reseller.name}
              </p>
              {wholesaleCtx.client && (
                <p className="text-xs text-slate-400 truncate">Client : {wholesaleCtx.client.name}</p>
              )}
            </div>
            <button
              onClick={() => { resetPriceOverrides(); onWholesaleChange?.(null); }}
              className="p-1 rounded text-amber-500 hover:text-white shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Alertes offres volume */}
        {wholesaleCtx && wholesaleCtx.offers.map((offer) => {
          const cartItem = items.find((i) => i.product_id === offer.product_id);
          if (!cartItem) return null;
          const eligible = cartItem.quantity >= offer.min_qty;
          return (
            <div key={offer.id} className={`mx-4 mb-1 px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs
              ${eligible ? 'bg-green-900/20 border border-green-800 text-green-400' : 'bg-amber-900/10 border border-amber-800/40 text-amber-500'}`}>
              <Gift className="w-3.5 h-3.5 shrink-0" />
              <span>
                {eligible
                  ? `✓ Offre déclenchée : ${offer.bonus_qty} ${offer.product_name ?? ''} offert${offer.bonus_qty > 1 ? 's' : ''}`
                  : `${offer.product_name} : encore ${offer.min_qty - cartItem.quantity} pour ${offer.bonus_qty} offert${offer.bonus_qty > 1 ? 's' : ''}`}
              </span>
            </div>
          );
        })}

        {/* ── Sélecteur client ── */}
        <div className="px-4 py-2 border-t border-surface-border" ref={clientRef}>
          {selectedClient ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-brand-900/20 border border-brand-700">
              <User className="w-3.5 h-3.5 text-brand-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-brand-300 truncate">{selectedClient.name}</p>
                {selectedClient.phone && <p className="text-xs text-slate-500">{selectedClient.phone}</p>}
              </div>
              <button
                onClick={() => onClientChange?.(null)}
                className="text-slate-500 hover:text-white shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <button
                onClick={openClientPicker}
                className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors py-1"
              >
                <User className="w-3.5 h-3.5" />
                Associer un client (optionnel)
              </button>

              {showClientDrop && (
                <div className="absolute bottom-full mb-1 left-0 right-0 z-50 bg-surface-card border border-surface-border rounded-xl shadow-xl overflow-hidden">
                  <div className="p-2 border-b border-surface-border">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                      <input
                        autoFocus
                        className="input pl-8 h-8 text-sm"
                        placeholder="Rechercher…"
                        value={clientSearch}
                        onChange={(e) => setClientSearch(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {filteredClients.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-4">
                        {clientList.length === 0 ? 'Aucun client enregistré' : 'Aucun résultat'}
                      </p>
                    ) : (
                      filteredClients.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => {
                            onClientChange?.({ id: c.id, name: c.name, phone: c.phone });
                            setShowClientDrop(false);
                            setClientSearch('');
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-hover transition-colors text-left"
                        >
                          <div className="w-7 h-7 rounded-full bg-surface-input flex items-center justify-center shrink-0 text-xs font-bold text-brand-400">
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm text-white truncate">{c.name}</p>
                            {c.phone && <p className="text-xs text-slate-500">{c.phone}</p>}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
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
              <span>TVA ({taxRate}%{taxInclusive ? ' incluse' : ''})</span>
              <span>{fmt(taxAmount(taxRate, taxInclusive))}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold text-white pt-1 border-t border-surface-border">
            <span>Total</span>
            <span className="text-brand-400">{fmt(total(taxRate, taxInclusive))}</span>
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
              : `Encaisser · ${fmt(total(taxRate, taxInclusive))}`}
          </button>
        </div>
      </div>

      {showHoldModal && (
        <HoldModal
          onConfirm={(label) => { holdCurrentOrder(label); }}
          onClose={() => setShowHoldModal(false)}
        />
      )}

      {showWholesale && (
        <WholesaleSelector
          businessId={businessId}
          current={wholesaleCtx ?? null}
          onClose={() => setShowWholesale(false)}
          onApplied={(ctx) => { onWholesaleChange?.(ctx); setShowWholesale(false); }}
          onReset={() => { resetPriceOverrides(); onWholesaleChange?.(null); }}
        />
      )}
    </>
  );
}
