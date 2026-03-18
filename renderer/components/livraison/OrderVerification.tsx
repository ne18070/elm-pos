'use client';

import { useState, useEffect, useCallback } from 'react';
import { Check, Package, ScanLine, X, CheckCheck, Loader2, Tag, Gift } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { formatCurrency } from '@/lib/utils';
import { BarcodeListener } from '@/components/pos/BarcodeListener';
import type { Order, OrderItem } from '@pos-types';

interface OrderVerificationProps {
  order: Order;
  currency: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function OrderVerification({ order, currency, onConfirm, onClose }: OrderVerificationProps) {
  // Set des IDs d'articles vérifiés (par l'opérateur)
  const [verified, setVerified] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const fmt = (n: number) => formatCurrency(n, currency);

  // Items à plat : si qty=3, on génère 3 "lignes" distinctes de vérification
  // Mais on garde le modèle simple : vérifier l'article entier (toute la qty)
  const items: OrderItem[] = order.items ?? [];
  const total = items.length;
  const verifiedCount = verified.size;
  const allDone = verifiedCount === total;
  const progress = total > 0 ? (verifiedCount / total) * 100 : 0;

  function toggleItem(id: string) {
    setVerified((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function checkAll() {
    setVerified(new Set(items.map((i) => i.id)));
  }

  function uncheckAll() {
    setVerified(new Set());
  }

  // Scan code-barres → coche l'article correspondant
  const handleBarcode = useCallback(
    (barcode: string) => {
      const match = items.find(
        (i) => i.product?.barcode === barcode
      );
      if (match) {
        setVerified((prev) => {
          if (prev.has(match.id)) return prev; // déjà coché
          const next = new Set(prev);
          next.add(match.id);
          return next;
        });
        setLastScanned(match.name);
        setTimeout(() => setLastScanned(null), 2000);
      } else {
        setLastScanned(`❌ Inconnu : ${barcode}`);
        setTimeout(() => setLastScanned(null), 2000);
      }
    },
    [items]
  );

  async function handleConfirm() {
    setConfirming(true);
    try { await onConfirm(); } finally { setConfirming(false); }
  }

  return (
    <>
      <BarcodeListener onScan={handleBarcode} />

      <div className="flex flex-col h-full">
        {/* En-tête commande */}
        <div className="px-6 py-4 border-b border-surface-border">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-mono font-bold text-white text-lg">
                #{order.id.slice(0, 8).toUpperCase()}
              </p>
              <p className="text-sm text-slate-400 mt-0.5">
                {format(new Date(order.created_at), 'dd MMM yyyy, HH:mm', { locale: fr })}
                {order.cashier && (
                  <span className="ml-2 text-slate-500">· {order.cashier.full_name}</span>
                )}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Barre de progression */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-slate-400">
                <span className={`font-semibold ${allDone ? 'text-green-400' : 'text-white'}`}>
                  {verifiedCount}
                </span>
                <span className="text-slate-500"> / {total} article{total > 1 ? 's' : ''} vérifiés</span>
              </span>
              <span className="text-brand-400 font-bold">{fmt(order.total)}</span>
            </div>
            <div className="h-2.5 bg-surface-input rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  allDone ? 'bg-green-500' : 'bg-brand-500'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Coupon appliqué */}
          {order.coupon_code && (
            <div className={`mt-3 flex items-center gap-2 px-3 py-2 rounded-xl text-sm border ${
              order.discount_amount > 0
                ? 'bg-green-900/20 border-green-800 text-green-300'
                : 'bg-amber-900/20 border-amber-800 text-amber-300'
            }`}>
              {order.discount_amount > 0
                ? <Tag className="w-4 h-4 shrink-0" />
                : <Gift className="w-4 h-4 shrink-0" />}
              <span className="font-medium">{order.coupon_code}</span>
              <span className="text-slate-400 mx-1">·</span>
              {order.discount_amount > 0
                ? <span>-{fmt(order.discount_amount)}</span>
                : <span>{order.coupon_notes ?? 'Article offert'}</span>}
            </div>
          )}

          {/* Notification scan */}
          {lastScanned && (
            <div className={`mt-3 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium
              ${lastScanned.startsWith('❌')
                ? 'bg-red-900/20 border border-red-800 text-red-300'
                : 'bg-green-900/20 border border-green-800 text-green-300'}`}>
              <ScanLine className="w-4 h-4 shrink-0" />
              {lastScanned.startsWith('❌') ? lastScanned : `✓ ${lastScanned}`}
            </div>
          )}
        </div>

        {/* Liste articles */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {/* Raccourcis */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={checkAll}
              disabled={allDone}
              className="btn-secondary text-xs flex items-center gap-1.5 py-1.5"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Tout cocher
            </button>
            <button
              onClick={uncheckAll}
              disabled={verifiedCount === 0}
              className="btn-secondary text-xs flex items-center gap-1.5 py-1.5"
            >
              <X className="w-3.5 h-3.5" />
              Tout décocher
            </button>
            <div className="flex-1" />
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <ScanLine className="w-3.5 h-3.5" />
              Scan actif
            </div>
          </div>

          {items.map((item) => {
            const done = verified.has(item.id);
            return (
              <button
                key={item.id}
                onClick={() => toggleItem(item.id)}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border text-left
                           transition-all duration-150 active:scale-[0.99]
                           ${done
                             ? 'bg-green-900/15 border-green-800'
                             : 'bg-surface-input border-surface-border hover:border-slate-500'}`}
              >
                {/* Checkbox visuel */}
                <div className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all
                  ${done
                    ? 'bg-green-500 border-green-500'
                    : 'border-slate-600'}`}>
                  {done && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
                </div>

                {/* Image miniature */}
                <div className="w-12 h-12 rounded-lg bg-surface-card border border-surface-border
                               overflow-hidden flex items-center justify-center shrink-0">
                  {item.product?.image_url ? (
                    <img
                      src={item.product.image_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Package className="w-6 h-6 text-slate-600" />
                  )}
                </div>

                {/* Infos article */}
                <div className="flex-1 min-w-0">
                  <p className={`font-medium truncate transition-colors ${
                    done ? 'text-green-300 line-through decoration-green-600/50' : 'text-white'
                  }`}>
                    {item.name}
                  </p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {item.product?.barcode && (
                      <span className="text-xs text-slate-500 font-mono">{item.product.barcode}</span>
                    )}
                    <span className="text-xs text-slate-400">{fmt(item.price)} / unité</span>
                  </div>
                </div>

                {/* Quantité */}
                <div className="shrink-0 text-right">
                  <p className={`text-xl font-bold ${done ? 'text-green-400' : 'text-white'}`}>
                    ×{item.quantity}
                  </p>
                  <p className="text-xs text-slate-500">{fmt(item.total)}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-surface-border space-y-3">
          {!allDone && (
            <p className="text-xs text-center text-slate-500">
              {total - verifiedCount} article{total - verifiedCount > 1 ? 's' : ''} restant{total - verifiedCount > 1 ? 's' : ''} à vérifier
            </p>
          )}
          <button
            onClick={handleConfirm}
            disabled={!allDone || confirming}
            className={`w-full h-12 rounded-xl font-semibold text-base flex items-center justify-center gap-2
              transition-all duration-200
              ${allDone && !confirming
                ? 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/30'
                : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}
          >
            {confirming ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Check className="w-5 h-5" />
            )}
            {confirming ? 'Validation...' : allDone ? 'Confirmer la livraison' : 'Vérifiez tous les articles'}
          </button>
        </div>
      </div>
    </>
  );
}
