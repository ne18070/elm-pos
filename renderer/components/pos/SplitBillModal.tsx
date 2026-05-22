'use client';

import { useState } from 'react';
import { Users, ChevronRight, Banknote, CreditCard, Smartphone, Loader2, CheckCircle, Minus, Plus } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { NumpadModal } from '@/components/ui/NumpadModal';
import { useCartStore } from '@/store/cart';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { formatCurrency } from '@/lib/utils';
import { createOrder } from '@services/supabase/orders';
import { openCashDrawer } from '@/lib/ipc';
import { computeOrderTotals } from '@domain/order.service';
import { PAYMENT_METHOD_LABELS } from '@domain/payment.service';
import type { PaymentMethod } from '@pos-types';

interface Props {
  taxRate: number;
  taxInclusive: boolean;
  currency: string;
  tableId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface PersonPayment {
  method: PaymentMethod;
  amount: number;
  received?: number;
}

const METHODS: PaymentMethod[] = ['cash', 'card', 'mobile_money'];

export function SplitBillModal({ taxRate, taxInclusive, currency, tableId, onClose, onSuccess }: Props) {
  const [n, setN]                     = useState(2);
  const [stage, setStage]             = useState<'config' | 'collect' | 'done'>('config');
  const [personIdx, setPersonIdx]     = useState(0);
  const [collected, setCollected]     = useState<PersonPayment[]>([]);
  const [method, setMethod]           = useState<PaymentMethod>('cash');
  const [received, setReceived]       = useState('');
  const [numpadOpen, setNumpadOpen]   = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [erreur, setErreur]           = useState('');

  const cart = useCartStore();
  const { user, business } = useAuthStore();
  const { success: notifSuccess, warning: notifWarning } = useNotificationStore();

  const fmt = (v: number) => formatCurrency(v, currency);
  const { subtotal, discountAmount, taxAmount, total } = computeOrderTotals(
    cart.items, cart.coupons, taxRate, taxInclusive
  );

  const share      = Math.round((total / n) * 100) / 100;
  const lastShare  = Math.round((total - share * (n - 1)) * 100) / 100;
  const currentAmt = personIdx === n - 1 ? lastShare : share;

  const receivedNum = parseFloat(received) || 0;
  const change      = method === 'cash' && receivedNum > currentAmt
    ? Math.round((receivedNum - currentAmt) * 100) / 100
    : 0;

  function confirmPerson() {
    if (method === 'cash' && received && receivedNum < currentAmt - 0.01) {
      setErreur('Montant reçu insuffisant');
      return;
    }
    const payment: PersonPayment = { method, amount: currentAmt, received: receivedNum || undefined };
    const next = [...collected, payment];
    setCollected(next);

    if (personIdx < n - 1) {
      setPersonIdx(personIdx + 1);
      setMethod('cash');
      setReceived('');
      setErreur('');
    } else {
      finalizeOrder(next);
    }
  }

  async function finalizeOrder(payments: PersonPayment[]) {
    if (!user || !business) return;
    setSubmitting(true);
    try {
      await createOrder({
        business_id:    business.id,
        cashier_id:     user.id,
        cart:           { items: cart.items, coupons: cart.coupons, discount_amount: discountAmount, notes: cart.notes },
        payment_method: payments.length === 1 ? payments[0].method : 'cash',
        payment_amount: total,
        payments:       payments.map(p => ({ method: p.method, amount: p.amount })),
        tax_rate:       taxRate,
        tax_inclusive:  taxInclusive,
        coupons:        cart.coupons,
        notes:          cart.notes,
        table_id:       tableId,
        order_channel:  cart.orderChannel !== 'salle' ? cart.orderChannel : undefined,
      });
      if (payments.some(p => p.method === 'cash')) {
        openCashDrawer().catch(() => {});
      }
      notifSuccess(`Addition partagée — ${n} parts encaissées`);
      cart.clear();
      setStage('done');
    } catch {
      notifWarning('Hors ligne — vente enregistrée localement');
      cart.clear();
      setStage('done');
    } finally {
      setSubmitting(false);
    }
  }

  const title = stage === 'config'
    ? 'Partager l\'addition'
    : stage === 'collect'
    ? `Part ${personIdx + 1} / ${n}`
    : 'Paiement terminé';

  return (
    <Modal title={title} onClose={onClose} size="sm" guard={stage !== 'done'}>
      {/* ── Config ── */}
      {stage === 'config' && (
        <div className="space-y-6">
          <div className="bg-surface-input rounded-xl p-4 flex justify-between items-center">
            <span className="text-content-secondary text-sm">Total à partager</span>
            <span className="text-2xl font-bold text-content-brand">{fmt(total)}</span>
          </div>

          <div>
            <p className="label mb-3">Nombre de personnes</p>
            <div className="flex items-center justify-center gap-6">
              <button
                onClick={() => setN(v => Math.max(2, v - 1))}
                disabled={n <= 2}
                className="w-10 h-10 rounded-xl bg-surface-card border border-surface-border flex items-center justify-center text-content-secondary hover:text-content-primary disabled:opacity-30 transition-colors"
              >
                <Minus className="w-4 h-4" />
              </button>
              <div className="text-center">
                <p className="text-4xl font-black text-content-primary tabular-nums">{n}</p>
                <p className="text-xs text-content-secondary mt-1">personnes</p>
              </div>
              <button
                onClick={() => setN(v => Math.min(10, v + 1))}
                disabled={n >= 10}
                className="w-10 h-10 rounded-xl bg-surface-card border border-surface-border flex items-center justify-center text-content-secondary hover:text-content-primary disabled:opacity-30 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="bg-surface-card rounded-xl border border-surface-border divide-y divide-surface-border">
            {Array.from({ length: n }).map((_, i) => {
              const amt = i === n - 1 ? lastShare : share;
              return (
                <div key={i} className="flex justify-between items-center px-4 py-2.5 text-sm">
                  <span className="text-content-secondary flex items-center gap-2">
                    <Users className="w-3.5 h-3.5" /> Personne {i + 1}
                  </span>
                  <span className="font-bold text-content-primary">{fmt(amt)}</span>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => setStage('collect')}
            className="btn-primary w-full h-11 flex items-center justify-center gap-2"
          >
            Commencer <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Collect ── */}
      {stage === 'collect' && (
        <div className="space-y-5">
          <div className="bg-surface-input rounded-xl p-4 space-y-1">
            <div className="flex justify-between text-sm text-content-secondary">
              <span>Part {personIdx + 1} / {n}</span>
              <span className="font-bold text-content-brand text-lg">{fmt(currentAmt)}</span>
            </div>
            <div className="flex gap-1 mt-2">
              {Array.from({ length: n }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    i < personIdx ? 'bg-status-success' :
                    i === personIdx ? 'bg-brand-500' :
                    'bg-surface-border'
                  }`}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="label mb-2">Moyen de paiement</p>
            <div className="grid grid-cols-3 gap-2">
              {METHODS.map(m => (
                <button
                  key={m}
                  onClick={() => { setMethod(m); setErreur(''); }}
                  className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs transition-all
                    ${method === m
                      ? 'border-brand-500 bg-badge-brand text-content-brand'
                      : 'border-surface-border text-content-secondary hover:border-slate-500'}`}
                >
                  {m === 'cash'         && <Banknote className="w-5 h-5" />}
                  {m === 'card'         && <CreditCard className="w-5 h-5" />}
                  {m === 'mobile_money' && <Smartphone className="w-5 h-5" />}
                  <span className="font-medium">{PAYMENT_METHOD_LABELS[m]}</span>
                </button>
              ))}
            </div>
          </div>

          {method === 'cash' && (
            <div>
              <p className="label mb-2">Montant reçu</p>
              <button
                onClick={() => { setNumpadOpen(true); setErreur(''); }}
                className="input text-2xl font-bold text-center py-3 w-full cursor-pointer hover:border-brand-500 transition-colors"
              >
                {received || <span className="text-content-primary">Appuyer pour saisir</span>}
              </button>
              {received && receivedNum >= currentAmt && (
                <div className="mt-2 p-3 rounded-xl bg-badge-success border border-status-success text-center">
                  <p className="text-xs text-content-secondary">Monnaie à rendre</p>
                  <p className="text-xl font-bold text-status-success">{fmt(change)}</p>
                </div>
              )}
            </div>
          )}

          {erreur && (
            <p className="text-sm text-status-error bg-badge-error border border-status-error rounded-xl px-3 py-2">{erreur}</p>
          )}

          <button
            onClick={confirmPerson}
            disabled={submitting || (method === 'cash' && !!received && receivedNum < currentAmt - 0.01)}
            className="btn-primary w-full h-11 flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? 'Enregistrement…' : personIdx < n - 1 ? `Confirmer · Part suivante` : 'Finaliser'}
          </button>
        </div>
      )}

      {/* ── Done ── */}
      {stage === 'done' && (
        <div className="flex flex-col items-center gap-5 py-6 text-center">
          <div className="w-16 h-16 rounded-full bg-badge-success flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-status-success" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-content-primary">Addition réglée !</h3>
            <p className="text-sm text-content-secondary mt-1">{n} parts — {fmt(total)}</p>
          </div>
          <div className="w-full bg-surface-card rounded-xl border border-surface-border divide-y divide-surface-border">
            {collected.map((p, i) => (
              <div key={i} className="flex justify-between items-center px-4 py-2.5 text-sm">
                <span className="text-content-secondary">Personne {i + 1} · {PAYMENT_METHOD_LABELS[p.method]}</span>
                <span className="font-bold text-content-primary">{fmt(p.amount)}</span>
              </div>
            ))}
          </div>
          <button onClick={onSuccess} className="btn-primary w-full h-11">Nouvelle vente</button>
        </div>
      )}

      {numpadOpen && (
        <NumpadModal
          value={received}
          label="Montant reçu"
          hint={`Part : ${fmt(currentAmt)}`}
          onDigit={setReceived}
          onClose={() => setNumpadOpen(false)}
        />
      )}
    </Modal>
  );
}
