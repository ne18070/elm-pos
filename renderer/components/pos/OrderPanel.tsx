'use client';

import { useState, useEffect, useRef } from 'react';
import { Minus, Plus, Trash2, ShoppingCart, Tag, X, Clock, AlertTriangle, Gift, Store, User, Search, Utensils } from 'lucide-react';
import { useCartStore } from '@/store/cart';
import { useNotificationStore } from '@/store/notifications';
import { formatCurrency } from '@/lib/utils';
import { getProducts } from '@services/supabase/products';
import { getClients, type Client } from '@services/supabase/clients';
import { CouponPicker } from './CouponPicker';
import { HoldModal } from './HoldModal';
import { WholesaleSelector } from './WholesaleSelector';
import type { WholesaleContext } from './WholesaleSelector';
import type { ResellerOffer } from '@services/supabase/resellers';
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
  isRestaurant?: boolean;
}

export function OrderPanel({ 
  taxRate, taxInclusive, currency, businessId, onCheckout, onShowHeld,
  isRestaurant
}: OrderPanelProps) {
  const {
    items, coupons, addCoupon, removeCoupon, addFreeItem, removeFreeItem,
    updateQuantity, removeItem, resetPriceOverrides,
    subtotal, discountAmount, taxAmount, total, itemCount,
    holdCurrentOrder, heldOrders,
    selectedClient, setSelectedClient,
    selectedTable: tableId, setSelectedTable: onTableClear,
    wholesaleCtx, setWholesaleCtx: onWholesaleChange
  } = useCartStore();
  
  const [tables, setTables] = useState<import('@pos-types').RestaurantTable[]>([]);
  const { warning, error: notifError } = useNotificationStore();
  
  useEffect(() => {
    if (tableId) {
      // Small optimization: if we have a tableId, fetch its info to show the name
      import('@services/supabase/restaurant')
        .then(m => m.getTables(businessId))
        .then(setTables)
        .catch(e => {
          console.error('Failed to load tables:', e);
          notifError('Impossible de charger les informations des tables');
        });
    }
  }, [tableId, businessId, notifError]);

  const selectedTable = tables.find(t => t.id === (typeof tableId === 'string' ? tableId : (tableId as any)?.id));
  const [showWholesale, setShowWholesale] = useState(false);

  // -- Sélecteur client ---------------------------------------------------------
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
      } catch (e) {
        console.error('Failed to load clients:', e);
        notifError('Impossible de charger la liste des clients');
      }
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
      } catch (e) {
        console.error('Failed to add free item for coupon:', e);
        notifError('Erreur lors de l\'ajout de l\'article offert');
      }
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

  // -- Panier vide --------------------------------------------------------------

  if (items.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between">
          <h2 className="font-semibold text-content-primary text-sm">Nouvelle vente</h2>
          {heldOrders.length > 0 && (
            <button
              onClick={onShowHeld}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                         bg-badge-brand border border-brand-700 text-content-brand
                         hover:bg-badge-brand transition-colors text-xs font-medium"
            >
              <Clock className="w-3.5 h-3.5" />
              En attente
              <span className="bg-brand-600 text-content-primary text-xs font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {heldOrders.length}
              </span>
            </button>
          )}
        </div>
        <div className="flex flex-col items-center justify-center flex-1 text-content-primary gap-3 px-4">
          <ShoppingCart className="w-12 h-12 opacity-30" />
          <p className="text-sm text-center">Sélectionnez des produits pour démarrer une vente</p>
        </div>
      </div>
    );
  }

  // -- Panier avec articles -----------------------------------------------------

  const hasOverStock = items.some(overStock);

  return (
    <>
      <div className="flex flex-col h-full">
        {/* En-tête */}
        <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between gap-2">
          <h2 className="font-semibold text-content-primary shrink-0">
            Commande{' '}
            <span className="text-content-brand">({itemCount()} article{itemCount() > 1 ? 's' : ''})</span>
          </h2>
          <div className="flex items-center gap-2 ml-auto">
            {/* Bouton mode grossiste */}
            <button
              onClick={() => setShowWholesale(true)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-colors text-xs font-medium shrink-0
                ${wholesaleCtx
                  ? 'border-amber-600 bg-badge-warning text-status-warning'
                  : 'border-surface-border text-content-secondary hover:border-amber-600 hover:text-status-warning'}`}
            >
              <Store className="w-3.5 h-3.5" />
              {wholesaleCtx ? wholesaleCtx.reseller.name : 'Gros'}
            </button>

            {heldOrders.length > 0 && (
              <button
                onClick={onShowHeld}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg
                           bg-badge-brand border border-brand-700 text-content-brand
                           hover:bg-badge-brand transition-colors text-xs font-medium shrink-0"
              >
                <Clock className="w-3.5 h-3.5" />
                <span className="bg-brand-600 text-content-primary text-xs font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {heldOrders.length}
                </span>
              </button>
            )}
            <button
              onClick={() => setShowHoldModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-surface-border
                         text-content-secondary hover:border-slate-500 hover:text-content-primary transition-colors text-xs font-medium shrink-0"
            >
              <Clock className="w-3.5 h-3.5" />
              Attente
            </button>
          </div>
        </div>

        {/* Alerte globale surstock (stock changé en temps réel) */}
        {hasOverStock && (
          <div className="mx-4 mt-3 flex items-start gap-2 p-3 bg-badge-error border border-status-error
                          rounded-xl text-xs text-status-error">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-status-error" />
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
                    ? 'bg-badge-error border-status-error'
                    : 'bg-surface-input border-transparent'
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-content-primary truncate">{item.name}</p>
                    <p className="text-xs text-content-secondary mt-0.5">{fmt(item.price)} / unité</p>
                  </div>
                  <button
                    onClick={() => removeItem(item.product_id, item.variant_id)}
                    className="text-content-primary hover:text-status-error transition-colors shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleQtyDecrease(item)}
                      className="w-7 h-7 rounded-lg bg-surface-card flex items-center justify-center
                                 text-content-secondary hover:text-content-primary hover:bg-brand-600 transition-colors"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className={`font-semibold w-6 text-center ${over ? 'text-status-error' : 'text-content-primary'}`}>
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => handleQtyIncrease(item)}
                      disabled={limited}
                      className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors
                        ${limited
                          ? 'bg-surface-card text-content-muted cursor-not-allowed'
                          : 'bg-surface-card text-content-secondary hover:text-content-primary hover:bg-brand-600'}`}
                      title={limited ? `Stock max : ${stock}` : undefined}
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="text-right">
                    <span className="text-content-primary font-bold block">{fmt(item.price * item.quantity)}</span>
                    {/* Indicateur stock */}
                    {item.product?.track_stock && (
                      <span className={`text-xs ${
                        over
                          ? 'text-status-error font-medium'
                          : limited
                          ? 'text-status-warning'
                          : 'text-content-primary'
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
                      ? 'bg-badge-warning border border-status-warning text-status-warning'
                      : 'bg-badge-success border border-status-success text-status-success'}`}
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
          <div className="mx-4 mb-2 px-3 py-2 rounded-xl bg-badge-warning border border-status-warning flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-status-warning flex items-center gap-1">
                <Store className="w-3 h-3" /> Prix de gros —{wholesaleCtx.reseller.name}
              </p>
              {wholesaleCtx.client && (
                <p className="text-xs text-content-secondary truncate">Client : {wholesaleCtx.client.name}</p>
              )}
            </div>
            <button
              onClick={() => { resetPriceOverrides(); onWholesaleChange?.(null); }}
              className="p-1 rounded text-status-warning hover:text-content-primary shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Alertes offres volume */}
        {wholesaleCtx && wholesaleCtx.offers.map((offer: ResellerOffer) => {
          const cartItem = items.find((i) => i.product_id === offer.product_id);
          if (!cartItem) return null;
          const eligible = cartItem.quantity >= offer.min_qty;
          return (
            <div key={offer.id} className={`mx-4 mb-1 px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs
              ${eligible ? 'bg-badge-success border border-status-success text-status-success' : 'bg-badge-warning border border-status-warning/40 text-status-warning'}`}>
              <Gift className="w-3.5 h-3.5 shrink-0" />
              <span>
                {eligible
                  ? `✁EOffre déclenchée : ${offer.bonus_qty} ${offer.product_name ?? ''} offert${offer.bonus_qty > 1 ? 's' : ''}`
                  : `${offer.product_name} : encore ${offer.min_qty - cartItem.quantity} pour ${offer.bonus_qty} offert${offer.bonus_qty > 1 ? 's' : ''}`}
              </span>
            </div>
          );
        })}

        {/* -- Sélecteur client -- */}
        <div className="px-4 py-2 border-t border-surface-border space-y-2">
          {/* Table Selector */}
          {tableId ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-900/20 border border-indigo-700 animate-in fade-in slide-in-from-bottom-2">
              <Utensils className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-indigo-300 truncate">Table {selectedTable?.name || 'chargement...'}</p>
                <p className="text-[10px] text-content-primary uppercase font-semibold">{selectedTable?.floor?.name}</p>
              </div>
              <button
                onClick={() => onTableClear(null)}
                className="text-content-primary hover:text-content-primary shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : isRestaurant && (
            <p className="text-[10px] text-content-primary italic px-1">Aucune table sélectionnée</p>
          )}

          {selectedClient ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-badge-brand border border-brand-700">
              <User className="w-3.5 h-3.5 text-content-brand shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-content-brand truncate">{selectedClient.name}</p>
                {selectedClient.phone && <p className="text-xs text-content-primary">{selectedClient.phone}</p>}
              </div>
              <button
                onClick={() => setSelectedClient(null)}
                className="text-content-primary hover:text-content-primary shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <button
                onClick={openClientPicker}
                className="flex items-center gap-2 text-xs text-content-secondary hover:text-content-primary transition-colors py-1"
              >
                <User className="w-3.5 h-3.5" />
                Associer un client (optionnel)
              </button>

              {showClientDrop && (
                <div className="absolute bottom-full mb-1 left-0 right-0 z-50 bg-surface-card border border-surface-border rounded-xl shadow-xl overflow-hidden">
                  <div className="p-2 border-b border-surface-border">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-primary" />
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
                      <p className="text-xs text-content-primary text-center py-4">
                        {clientList.length === 0 ? 'Aucun client enregistré' : 'Aucun résultat'}
                      </p>
                    ) : (
                      filteredClients.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => {
                            setSelectedClient({ id: c.id, name: c.name, phone: c.phone });
                            setShowClientDrop(false);
                            setClientSearch('');
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-hover transition-colors text-left"
                        >
                          <div className="w-7 h-7 rounded-full bg-surface-input flex items-center justify-center shrink-0 text-xs font-bold text-content-brand">
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm text-content-primary truncate">{c.name}</p>
                            {c.phone && <p className="text-xs text-content-primary">{c.phone}</p>}
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
          <div className="flex justify-between text-sm text-content-secondary">
            <span>Sous-total</span>
            <span>{fmt(subtotal())}</span>
          </div>
          {discountAmount() > 0 && (
            <div className="flex justify-between text-sm text-status-success">
              <span>Remise</span>
              <span>-{fmt(discountAmount())}</span>
            </div>
          )}
          {taxRate > 0 && (
            <div className="flex justify-between text-sm text-content-secondary">
              <span>TVA ({taxRate}%{taxInclusive ? ' incluse' : ''})</span>
              <span>{fmt(taxAmount(taxRate, taxInclusive))}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold text-content-primary pt-1 border-t border-surface-border">
            <span>Total</span>
            <span className="text-content-brand">{fmt(total(taxRate, taxInclusive))}</span>
          </div>
        </div>

        {/* Bouton paiement */}
        <div className="p-4 border-t border-surface-border">
          <button
            onClick={onCheckout}
            disabled={hasOverStock}
            className={`w-full h-12 text-base flex items-center justify-center gap-2 rounded-xl font-semibold transition-all
              ${hasOverStock
                ? 'bg-slate-700 text-content-primary cursor-not-allowed'
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
