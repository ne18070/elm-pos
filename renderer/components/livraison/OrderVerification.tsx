'use client';

import { useState, useCallback } from 'react';
import { Check, Package, ScanLine, ScanBarcode, X, CheckCheck, Loader2, Tag, Gift, WifiOff } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { formatCurrency } from '@/lib/utils';
import { BarcodeListener } from '@/components/pos/BarcodeListener';
import type { Order, OrderItem } from '@pos-types';

const SCANNER_KEY = 'delivery_scanner_enabled';

interface OrderVerificationProps {
  order: Order;
  currency: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function OrderVerification({ order, currency, onConfirm, onClose }: OrderVerificationProps) {
  const [verified, setVerified] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [lastScanned, setLastScanned] = useState<{ text: string; ok: boolean } | null>(null);

  // Scanner activé/désactivé —persisté en localStorage
  const [scannerEnabled, setScannerEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem(SCANNER_KEY);
    return saved === null ? true : saved === 'true';
  });

  function toggleScanner() {
    setScannerEnabled((prev) => {
      const next = !prev;
      localStorage.setItem(SCANNER_KEY, String(next));
      return next;
    });
  }

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

  // Scan code-barres —coche l'article correspondant
  const handleBarcode = useCallback(
    (barcode: string) => {
      const match = items.find((i) => i.product?.barcode === barcode);
      if (match) {
        setVerified((prev) => {
          if (prev.has(match.id)) return prev;
          const next = new Set(prev);
          next.add(match.id);
          return next;
        });
        setLastScanned({ text: match.name, ok: true });
        setTimeout(() => setLastScanned(null), 2500);
      } else {
        setLastScanned({ text: `Code inconnu : ${barcode}`, ok: false });
        setTimeout(() => setLastScanned(null), 2500);
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
      {/* Scanner monté uniquement si activé */}
      {scannerEnabled && <BarcodeListener onScan={handleBarcode} />}

      <div className="flex flex-col h-full">
        {/* En-tête commande */}
        <div className="px-6 py-4 border-b border-surface-border">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-mono font-bold text-content-primary text-lg">
                #{order.id.slice(0, 8).toUpperCase()}
              </p>
              <p className="text-sm text-content-secondary mt-0.5">
                {format(new Date(order.created_at), 'dd MMM yyyy, HH:mm', { locale: fr })}
                {order.cashier && (
                  <span className="ml-2 text-content-primary">· {order.cashier.full_name}</span>
                )}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-content-secondary hover:text-content-primary transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Barre de progression */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-content-secondary">
                <span className={`font-semibold ${allDone ? 'text-status-success' : 'text-content-primary'}`}>
                  {verifiedCount}
                </span>
                <span className="text-content-primary"> / {total} article{total > 1 ? 's' : ''} vérifiés</span>
              </span>
              <span className="text-content-brand font-bold">{fmt(order.total)}</span>
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
                ? 'bg-badge-success border-status-success text-status-success'
                : 'bg-badge-warning border-status-warning text-status-warning'
            }`}>
              {order.discount_amount > 0
                ? <Tag className="w-4 h-4 shrink-0" />
                : <Gift className="w-4 h-4 shrink-0" />}
              <span className="font-medium">{order.coupon_code}</span>
              <span className="text-content-secondary mx-1">·</span>
              {order.discount_amount > 0
                ? <span>-{fmt(order.discount_amount)}</span>
                : <span>{order.coupon_notes ?? 'Article offert'}</span>}
            </div>
          )}

          {/* Notification scan */}
          {lastScanned && (
            <div className={`mt-3 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border ${
              lastScanned.ok
                ? 'bg-badge-success border-status-success text-status-success'
                : 'bg-badge-error border-status-error text-status-error'
            }`}>
              <ScanLine className="w-4 h-4 shrink-0" />
              {lastScanned.ok ? `✁E${lastScanned.text}` : lastScanned.text}
            </div>
          )}
        </div>

        {/* Liste articles */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {/* Raccourcis + toggle scanner */}
          <div className="flex flex-wrap gap-2 mb-4">
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

            {/* Toggle scanner */}
            <button
              onClick={toggleScanner}
              title={scannerEnabled ? 'Désactiver le scanner (panne / absence)' : 'Activer le scanner'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                scannerEnabled
                  ? 'border-brand-700 bg-badge-brand text-content-brand hover:bg-badge-brand'
                  : 'border-slate-700 bg-surface-input text-content-primary hover:border-slate-600 hover:text-content-primary'
              }`}
            >
              {scannerEnabled
                ? <><ScanBarcode className="w-3.5 h-3.5" /> Scanner actif</>
                : <><WifiOff className="w-3.5 h-3.5" /> Mode manuel</>}
            </button>
          </div>

          {/* Bannière mode manuel */}
          {!scannerEnabled && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-badge-warning border border-status-warning rounded-xl text-xs text-status-warning">
              <WifiOff className="w-3.5 h-3.5 shrink-0" />
              Scanner désactivé —cochage manuel uniquement. Cliquez sur un article pour le valider.
            </div>
          )}

          {items.map((item) => {
            const done = verified.has(item.id);
            return (
              <button
                key={item.id}
                onClick={() => toggleItem(item.id)}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border text-left
                           transition-all duration-150 active:scale-[0.99]
                           ${done
                             ? 'bg-badge-success border-status-success'
                             : 'bg-surface-input border-surface-border hover:border-slate-500'}`}
              >
                {/* Checkbox visuel */}
                <div className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all
                  ${done
                    ? 'bg-green-500 border-green-500'
                    : 'border-slate-600'}`}>
                  {done && <Check className="w-4 h-4 text-content-primary" strokeWidth={3} />}
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
                    <Package className="w-6 h-6 text-content-muted" />
                  )}
                </div>

                {/* Infos article */}
                <div className="flex-1 min-w-0">
                  <p className={`font-medium truncate transition-colors ${
                    done ? 'text-status-success line-through decoration-green-600/50' : 'text-content-primary'
                  }`}>
                    {item.name}
                  </p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {item.product?.barcode && (
                      <span className="text-xs text-content-primary font-mono">{item.product.barcode}</span>
                    )}
                    <span className="text-xs text-content-secondary">{fmt(item.price)} / unité</span>
                  </div>
                </div>

                {/* Quantité */}
                <div className="shrink-0 text-right">
                  <p className={`text-xl font-bold ${done ? 'text-status-success' : 'text-content-primary'}`}>
                    ×{item.quantity}
                  </p>
                  <p className="text-xs text-content-primary">{fmt(item.total)}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-surface-border space-y-3">
          {!allDone && (
            <p className="text-xs text-center text-content-primary">
              {total - verifiedCount} article{total - verifiedCount > 1 ? 's' : ''} restant{total - verifiedCount > 1 ? 's' : ''} à vérifier
            </p>
          )}
          <button
            onClick={handleConfirm}
            disabled={!allDone || confirming}
            className={`w-full h-12 rounded-xl font-semibold text-base flex items-center justify-center gap-2
              transition-all duration-200
              ${allDone && !confirming
                ? 'bg-green-600 hover:bg-green-500 text-content-primary shadow-lg shadow-green-900/30'
                : 'bg-slate-700 text-content-primary cursor-not-allowed'}`}
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


