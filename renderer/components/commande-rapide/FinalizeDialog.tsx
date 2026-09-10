'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { formatCurrency } from '@/lib/utils';

export type FinalizeMode = 'bl' | 'cash' | 'acompte';

export interface FinalizePayload {
  mode: FinalizeMode;
  customerName: string;
  customerPhone: string;
  /** cash : montant reçu · acompte : montant versé · bl : 0 */
  amount: number;
}

interface Props {
  mode: FinalizeMode;
  total: number;
  currency: string;
  defaultName: string;
  defaultPhone: string;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (p: FinalizePayload) => void;
}

const TITLES: Record<FinalizeMode, string> = {
  bl: 'Bon de livraison',
  cash: 'Encaisser la commande',
  acompte: 'Enregistrer un acompte',
};

const num = (v: string) => {
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export function FinalizeDialog({
  mode, total, currency, defaultName, defaultPhone, submitting, error, onCancel, onConfirm,
}: Props) {
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  const [amountStr, setAmountStr] = useState('');
  const fmt = (n: number) => formatCurrency(n, currency);

  const amount = num(amountStr);
  const change = mode === 'cash' && amount > total ? amount - total : 0;
  const remaining = mode === 'acompte' ? Math.max(0, total - amount) : 0;

  const nameRequired = mode !== 'cash';
  const disabled =
    submitting ||
    (nameRequired && !name.trim()) ||
    (mode === 'cash' && amount < total - 0.01) ||
    (mode === 'acompte' && (amount <= 0 || amount >= total - 0.01));

  return (
    <Modal
      title={TITLES[mode]}
      onClose={onCancel}
      size="sm"
      guard={submitting}
      footer={
        <div className="flex gap-2">
          <button onClick={onCancel} className="btn-secondary flex-1 h-10" disabled={submitting}>
            Annuler
          </button>
          <button
            onClick={() => onConfirm({ mode, customerName: name.trim(), customerPhone: phone.trim(), amount })}
            disabled={disabled}
            className="btn-primary flex-1 h-10 flex items-center justify-center gap-2 disabled:opacity-40"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === 'bl' ? 'Créer le bon' : mode === 'cash' ? 'Confirmer' : "Confirmer l'acompte"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex justify-between items-center bg-surface-input rounded-xl px-4 py-3">
          <span className="text-content-secondary text-sm">
            {mode === 'bl' ? 'Net à payer plus tard' : 'Net à payer'}
          </span>
          <span className="text-2xl font-bold text-content-brand tabular-nums">{fmt(total)}</span>
        </div>

        <div>
          <label className="label">
            Nom du client {nameRequired && <span className="text-status-error">*</span>}
          </label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label">Téléphone</label>
          <input className="input" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>

        {mode === 'cash' && (
          <div>
            <label className="label">Montant reçu</label>
            <input
              className="input text-xl font-bold text-center tabular-nums"
              inputMode="decimal"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder={String(total)}
            />
            {change > 0 && (
              <div className="mt-2 flex justify-between text-sm text-status-success">
                <span>Monnaie à rendre</span>
                <span className="font-bold tabular-nums">{fmt(change)}</span>
              </div>
            )}
          </div>
        )}

        {mode === 'acompte' && (
          <div>
            <label className="label">Montant versé</label>
            <input
              className="input text-xl font-bold text-center tabular-nums"
              inputMode="decimal"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder="0"
            />
            {amount > 0 && (
              <div className="mt-2 flex justify-between text-sm text-status-warning">
                <span>Reste à régler</span>
                <span className="font-bold tabular-nums">{fmt(remaining)}</span>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="text-sm text-status-error bg-badge-error border border-status-error rounded-xl px-3 py-2">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
