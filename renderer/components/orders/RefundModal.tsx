'use client';

import { useState } from 'react';
import { Loader2, RotateCcw, AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { formatCurrency } from '@/lib/utils';
import { toUserError } from '@/lib/user-error';
import type { Order, Refund } from '@pos-types';

interface RefundModalProps {
  order:    Order;
  currency: string;
  refunds?: Refund[];   // remboursements déjà effectués sur cette commande
  onConfirm: (amount: number, reason: string) => Promise<void>;
  onClose:   () => void;
}

export function RefundModal({ order, currency, refunds = [], onConfirm, onClose }: RefundModalProps) {
  const [type,   setType]   = useState<'full' | 'partial'>('full');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const alreadyRefunded = refunds.reduce((s, r) => s + r.amount, 0);
  const maxRefundable   = Math.max(0, Math.round((order.total - alreadyRefunded) * 100) / 100);

  const refundAmount = type === 'full' ? maxRefundable : (parseFloat(amount) || 0);

  const amountError =
    type === 'partial' && parseFloat(amount) > 0 && parseFloat(amount) > maxRefundable
      ? `Dépasse le remboursable (${formatCurrency(maxRefundable, currency)})`
      : null;

  const isValid =
    refundAmount > 0 &&
    refundAmount <= maxRefundable + 0.01 &&
    reason.trim().length >= 3 &&
    !amountError;

  async function handleConfirm() {
    if (!isValid) {
      if (!reason.trim()) { setError('Le motif du remboursement est obligatoire'); return; }
      return;
    }
    setLoading(true);
    setError('');
    try {
      await onConfirm(refundAmount, reason.trim());
    } catch (err) {
      setError(toUserError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title="Remboursement"
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary px-5">Annuler</button>
          <button
            onClick={handleConfirm}
            disabled={loading || !isValid}
            className="btn-primary px-5 flex items-center gap-2 bg-purple-600 hover:bg-purple-500"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            Rembourser {formatCurrency(refundAmount, currency)}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Récap commande */}
        <div className="bg-surface-input rounded-xl p-3 text-sm space-y-1">
          <div className="flex justify-between text-content-secondary">
            <span>Commande</span>
            <span className="font-mono">#{order.id.slice(0, 8).toUpperCase()}</span>
          </div>
          <div className="flex justify-between text-content-primary font-semibold">
            <span>Total payé</span>
            <span>{formatCurrency(order.total, currency)}</span>
          </div>
          {alreadyRefunded > 0 && (
            <>
              <div className="flex justify-between text-status-purple text-xs">
                <span>Déjà remboursé</span>
                <span>-{formatCurrency(alreadyRefunded, currency)}</span>
              </div>
              <div className="flex justify-between font-bold border-t border-surface-border pt-1">
                <span className="text-content-primary">Remboursable</span>
                <span className="text-status-purple">{formatCurrency(maxRefundable, currency)}</span>
              </div>
            </>
          )}
        </div>

        {/* Type de remboursement */}
        <div>
          <label className="label">Type de remboursement</label>
          <div className="flex gap-2 mt-1">
            {(['full', 'partial'] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setType(t); setAmount(''); setError(''); }}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all
                  ${type === t
                    ? 'border-purple-500 bg-badge-purple text-status-purple'
                    : 'border-surface-border text-content-secondary hover:border-slate-500'}`}
              >
                {t === 'full' ? `Total (${formatCurrency(maxRefundable, currency)})` : 'Partiel'}
              </button>
            ))}
          </div>
        </div>

        {/* Montant partiel */}
        {type === 'partial' && (
          <div>
            <label className="label">
              Montant à rembourser
              <span className="text-content-muted text-[10px] ml-1">
                (max {formatCurrency(maxRefundable, currency)})
              </span>
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setError(''); }}
              className="input"
              min="0.01"
              max={maxRefundable}
              step="any"
              autoFocus
            />
            {amountError && (
              <p className="text-xs text-status-error mt-1">{amountError}</p>
            )}
          </div>
        )}

        {/* Motif (obligatoire) */}
        <div>
          <label className="label">
            Motif du remboursement <span className="text-status-error">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => { setReason(e.target.value); setError(''); }}
            className="input resize-none"
            rows={2}
            placeholder="Ex : Produit défectueux, erreur de commande…"
          />
          {reason.trim().length > 0 && reason.trim().length < 3 && (
            <p className="text-xs text-content-muted mt-1">Motif trop court</p>
          )}
        </div>

        {/* Avertissement remboursement total */}
        {type === 'full' && (
          <div className="flex gap-2 p-3 bg-yellow-900/20 border border-yellow-800 rounded-xl text-xs text-yellow-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Le stock des produits sera restauré et le coupon éventuellement appliqué sera décrémenté.
            </span>
          </div>
        )}

        {error && (
          <p className="text-sm text-status-error bg-badge-error border border-status-error rounded-xl p-3">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
