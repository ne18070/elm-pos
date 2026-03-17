'use client';

import { X, Clock, RotateCcw, Trash2, ShoppingBag } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useCartStore } from '@/store/cart';
import { formatCurrency } from '@/lib/utils';

interface HeldOrdersDrawerProps {
  currency: string;
  taxRate: number;
  onClose: () => void;
}

export function HeldOrdersDrawer({ currency, taxRate, onClose }: HeldOrdersDrawerProps) {
  const { heldOrders, recallHeldOrder, discardHeldOrder, items: currentItems, holdCurrentOrder } = useCartStore();
  const fmt = (n: number) => formatCurrency(n, currency);

  function handleRecall(id: string) {
    // Si le panier actuel a des articles → le mettre aussi en attente avant de rappeler
    if (currentItems.length > 0) {
      holdCurrentOrder('Précédent');
    }
    recallHeldOrder(id);
    onClose();
  }

  function handleDiscard(id: string) {
    if (!confirm('Supprimer cette commande en attente ?')) return;
    discardHeldOrder(id);
    if (heldOrders.length <= 1) onClose();
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Tiroir */}
      <div className="fixed right-0 top-0 h-full w-80 bg-surface-card border-l border-surface-border z-50
                      flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        {/* En-tête */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-surface-border">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-brand-400" />
            <h2 className="font-semibold text-white">Commandes en attente</h2>
            <span className="bg-brand-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {heldOrders.length}
            </span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Liste */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {heldOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
              <ShoppingBag className="w-12 h-12 opacity-30" />
              <p className="text-sm text-center">Aucune commande en attente</p>
            </div>
          ) : (
            heldOrders.map((held) => {
              const subtotal = held.items.reduce((s, i) => s + i.price * i.quantity, 0);
              const discount = held.coupon
                ? held.coupon.type === 'percentage'
                  ? Math.round(subtotal * held.coupon.value / 100 * 100) / 100
                  : Math.min(held.coupon.value, subtotal)
                : 0;
              const tax   = Math.round((subtotal - discount) * taxRate) / 100;
              const total = subtotal - discount + tax;

              return (
                <div
                  key={held.id}
                  className="card p-4 space-y-3 cursor-pointer hover:border-brand-600 transition-colors group"
                  onClick={() => handleRecall(held.id)}
                >
                  {/* Header carte */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white truncate">{held.label}</p>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" />
                        {formatDistanceToNow(new Date(held.heldAt), {
                          addSuffix: true,
                          locale: fr,
                        })}
                      </p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDiscard(held.id); }}
                      className="text-slate-600 hover:text-red-400 transition-colors shrink-0 p-1"
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Articles */}
                  <div className="space-y-1">
                    {held.items.slice(0, 3).map((item) => (
                      <div
                        key={`${item.product_id}::${item.variant_id ?? ''}`}
                        className="flex justify-between text-xs"
                      >
                        <span className="text-slate-400 truncate flex-1">
                          {item.quantity > 1 && (
                            <span className="text-slate-500 mr-1">{item.quantity}×</span>
                          )}
                          {item.name}
                        </span>
                        <span className="text-slate-300 shrink-0 ml-2">
                          {fmt(item.price * item.quantity)}
                        </span>
                      </div>
                    ))}
                    {held.items.length > 3 && (
                      <p className="text-xs text-slate-600">
                        +{held.items.length - 3} article{held.items.length - 3 > 1 ? 's' : ''}…
                      </p>
                    )}
                  </div>

                  {/* Coupon */}
                  {held.coupon && (
                    <div className="text-xs text-green-400 bg-green-900/20 px-2 py-1 rounded-lg">
                      Coupon : {held.coupon.code}
                    </div>
                  )}

                  {/* Total + bouton rappel */}
                  <div className="flex items-center justify-between pt-2 border-t border-surface-border">
                    <span className="text-sm font-bold text-brand-400">{fmt(total)}</span>
                    <div className="flex items-center gap-1 text-xs text-brand-400 group-hover:text-white
                                    transition-colors font-medium">
                      <RotateCcw className="w-3.5 h-3.5" />
                      Rappeler
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-3 border-t border-surface-border">
          <p className="text-xs text-slate-500 text-center">
            Cliquez sur une commande pour la rappeler
          </p>
        </div>
      </div>
    </>
  );
}
