'use client';

import { useState } from 'react';
import { Loader2, RotateCcw, AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { formatCurrency } from '@/lib/utils';
import type { Order } from '@pos-types';

interface RefundModalProps {
  order: Order;
  currency: string;
  onConfirm: (amount: number, reason: string) => Promise<void>;
  onClose: () => void;
}

export function RefundModal({ order, currency, onConfirm, onClose }: RefundModalProps) {
  const [type, setType] = useState<'full' | 'partial'>('full');
  const [amount, setAmount] = useState(String(order.total));
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refundAmount = type === 'full' ? order.total : parseFloat(amount) || 0;
  const isPartial = type === 'partial';
  const isValid = refundAmount > 0 && refundAmount <= order.total;

  async function handleConfirm() {
    if (!isValid) return;
    setLoading(true);
    setError('');
    try {
      await onConfirm(refundAmount, reason);
    } catch (err) {
      setError(String(err));
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
        <div className="bg-surface-input rounded-xl p-3 text-sm">
          <div className="flex justify-between text-slate-400">
            <span>Commande</span>
            <span className="font-mono">#{order.id.slice(0, 8).toUpperCase()}</span>
          </div>
          <div className="flex justify-between text-white font-semibold mt-1">
            <span>Total payé</span>
            <span>{formatCurrency(order.total, currency)}</span>
          </div>
        </div>

        {/* Type de remboursement */}
        <div>
          <label className="label">Type de remboursement</label>
          <div className="flex gap-2 mt-1">
            {(['full', 'partial'] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setType(t);
                  if (t === 'full') setAmount(String(order.total));
                }}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all
                  ${type === t
                    ? 'border-purple-500 bg-purple-900/20 text-purple-300'
                    : 'border-surface-border text-slate-400 hover:border-slate-500'}`}
              >
                {t === 'full' ? 'Total' : 'Partiel'}
              </button>
            ))}
          </div>
        </div>

        {/* Montant partiel */}
        {isPartial && (
          <div>
            <label className="label">Montant à rembourser</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input"
              min="0.01"
              max={order.total}
              step="0.01"
              autoFocus
            />
            {parseFloat(amount) > order.total && (
              <p className="text-xs text-red-400 mt-1">
                Dépasse le total de la commande
              </p>
            )}
          </div>
        )}

        {/* Raison */}
        <div>
          <label className="label">Motif du remboursement</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="input resize-none"
            rows={2}
            placeholder="Ex: Produit défectueux, erreur de commande..."
          />
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
          <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-xl p-3">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
