'use client';

import { useState } from 'react';
import { CreditCard, Banknote, Smartphone, Loader2, CheckCircle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useCartStore } from '@/store/cart';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { formatCurrency } from '@/lib/utils';
import { printReceipt } from '@/lib/ipc';
import { createOrder } from '../../../services/supabase/orders';
import { enqueueToSync } from '@/lib/ipc';
import {
  computeChange,
  suggestRoundAmounts,
  PAYMENT_METHOD_LABELS,
  validatePayment,
  formatPaymentError,
} from '../../../domain/payment.service';
import {
  validateOrderPayload,
  buildOrderDbPayload,
  computeOrderTotals,
  formatOrderError,
} from '../../../domain/order.service';
import type { PaymentMethod } from '../../../../types';

interface PaymentModalProps {
  taxRate: number;
  currency: string;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'methode' | 'montant' | 'succes';

const METHODES: PaymentMethod[] = ['cash', 'card', 'mobile_money'];

export function PaymentModal({ taxRate, currency, onClose, onSuccess }: PaymentModalProps) {
  const [step, setStep]         = useState<Step>('methode');
  const [methode, setMethode]   = useState<PaymentMethod>('cash');
  const [montantRecu, setMontantRecu] = useState('');
  const [chargement, setChargement]   = useState(false);
  const [ordreId, setOrdreId]         = useState<string | null>(null);
  const [erreur, setErreur]           = useState('');

  const cart = useCartStore();
  const { user, business } = useAuthStore();
  const { success: notifSuccess, error: notifError, warning: notifWarning } =
    useNotificationStore();

  const fmt = (n: number) => formatCurrency(n, currency);
  const { subtotal, discountAmount, taxAmount, total } = computeOrderTotals(
    cart.items,
    cart.coupon,
    taxRate
  );

  const montantRecuNum = parseFloat(montantRecu) || 0;
  const rendu = methode === 'cash' && montantRecu
    ? computeChange(montantRecuNum, total)
    : 0;
  const suggestions = suggestRoundAmounts(total);

  async function handleConfirmer() {
    if (!user || !business) return;
    setErreur('');

    // Validation métier
    const orderError = validateOrderPayload({
      businessId: business.id,
      cashierId: user.id,
      cart: { items: cart.items, coupon: cart.coupon ?? undefined, discount_amount: discountAmount, notes: cart.notes },
      paymentMethod: methode,
      paymentAmount: methode === 'cash' ? montantRecuNum : total,
      taxRate,
    });

    if (orderError) {
      setErreur(formatOrderError(orderError));
      return;
    }

    const payError = validatePayment({
      orderId: 'new',
      method: methode,
      amount: total,
      received: methode === 'cash' ? montantRecuNum : undefined,
    });

    if (payError) {
      setErreur(formatPaymentError(payError));
      return;
    }

    setChargement(true);

    try {
      const dbPayload = buildOrderDbPayload({
        businessId: business.id,
        cashierId: user.id,
        cart: { items: cart.items, coupon: cart.coupon ?? undefined, discount_amount: discountAmount, notes: cart.notes },
        paymentMethod: methode,
        paymentAmount: methode === 'cash' ? montantRecuNum : total,
        taxRate,
        notes: cart.notes,
      });

      const order = await createOrder({
        business_id: business.id,
        cashier_id: user.id,
        cart: { items: cart.items, coupon: cart.coupon ?? undefined, discount_amount: discountAmount, notes: cart.notes },
        payment_method: methode,
        payment_amount: methode === 'cash' ? montantRecuNum : total,
        tax_rate: taxRate,
        coupon: cart.coupon ?? undefined,
        notes: cart.notes,
      });

      setOrdreId(order.id);

      // Impression reçu (non bloquante)
      printReceipt({ order, business, cashier_name: user.full_name }).catch(() =>
        notifWarning("Reçu non imprimé — imprimante indisponible")
      );

      notifSuccess('Paiement enregistré avec succès');
      cart.clear();
      setStep('succes');
    } catch (err) {
      // Mode hors ligne : mettre en file d'attente avec le bon payload
      const dbPayload = buildOrderDbPayload({
        businessId: business.id,
        cashierId: user.id,
        cart: { items: cart.items, coupon: cart.coupon ?? undefined, discount_amount: discountAmount, notes: cart.notes },
        paymentMethod: methode,
        paymentAmount: methode === 'cash' ? montantRecuNum : total,
        taxRate,
        notes: cart.notes,
      });

      await enqueueToSync('create_order', dbPayload);
      notifWarning("Hors ligne — vente enregistrée, synchronisation automatique à la reconnexion");
      cart.clear();
      setStep('succes');
    } finally {
      setChargement(false);
    }
  }

  return (
    <Modal
      title={step === 'succes' ? 'Paiement réussi' : 'Encaissement'}
      onClose={onClose}
      size="sm"
    >
      {/* Étape 1 : méthode */}
      {step === 'methode' && (
        <div className="space-y-5">
          <div>
            <p className="label">Total à encaisser</p>
            <p className="text-3xl font-bold text-brand-400">{fmt(total)}</p>
            {discountAmount > 0 && (
              <p className="text-xs text-green-400 mt-0.5">
                Remise appliquée : -{fmt(discountAmount)}
              </p>
            )}
          </div>

          <div>
            <p className="label">Moyen de paiement</p>
            <div className="grid grid-cols-3 gap-3">
              {METHODES.map((m) => (
                <button
                  key={m}
                  onClick={() => setMethode(m)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all
                    ${methode === m
                      ? 'border-brand-500 bg-brand-900/30 text-brand-400'
                      : 'border-surface-border text-slate-400 hover:border-slate-500 hover:text-white'
                    }`}
                >
                  {m === 'cash' && <Banknote className="w-6 h-6" />}
                  {m === 'card' && <CreditCard className="w-6 h-6" />}
                  {m === 'mobile_money' && <Smartphone className="w-6 h-6" />}
                  <span className="text-xs font-medium text-center">
                    {PAYMENT_METHOD_LABELS[m]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <button onClick={() => setStep('montant')} className="btn-primary w-full h-11">
            Continuer
          </button>
        </div>
      )}

      {/* Étape 2 : montant */}
      {step === 'montant' && (
        <div className="space-y-5">
          <div className="bg-surface-input rounded-xl p-3 space-y-1">
            <div className="flex justify-between text-sm text-slate-400">
              <span>Sous-total</span><span>{fmt(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-sm text-green-400">
                <span>Remise</span><span>-{fmt(discountAmount)}</span>
              </div>
            )}
            {taxAmount > 0 && (
              <div className="flex justify-between text-sm text-slate-400">
                <span>TVA</span><span>{fmt(taxAmount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-white pt-1 border-t border-surface-border">
              <span>Total</span><span className="text-brand-400">{fmt(total)}</span>
            </div>
          </div>

          {methode === 'cash' && (
            <div>
              <label className="label">Montant reçu</label>
              <input
                type="number"
                inputMode="decimal"
                value={montantRecu}
                onChange={(e) => { setMontantRecu(e.target.value); setErreur(''); }}
                placeholder="0"
                className="input text-2xl font-bold text-center py-3"
                autoFocus
              />
              {/* Suggestions montants */}
              <div className="grid grid-cols-4 gap-2 mt-2">
                {suggestions.map((v) => (
                  <button
                    key={v}
                    onClick={() => setMontantRecu(String(v))}
                    className={`btn-secondary py-1.5 text-xs ${
                      montantRecuNum === v ? 'border border-brand-500 text-brand-400' : ''
                    }`}
                  >
                    {fmt(v)}
                  </button>
                ))}
              </div>

              {montantRecu && montantRecuNum >= total && (
                <div className="mt-3 p-3 rounded-xl bg-green-900/20 border border-green-800 text-center">
                  <p className="text-xs text-slate-400">Monnaie à rendre</p>
                  <p className="text-2xl font-bold text-green-400">{fmt(rendu)}</p>
                </div>
              )}
            </div>
          )}

          {erreur && (
            <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-xl px-3 py-2">
              {erreur}
            </p>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep('methode')} className="btn-secondary flex-1 h-11">
              Retour
            </button>
            <button
              onClick={handleConfirmer}
              disabled={chargement || (methode === 'cash' && (!montantRecu || montantRecuNum < total))}
              className="btn-primary flex-1 h-11 flex items-center justify-center gap-2"
            >
              {chargement && <Loader2 className="w-4 h-4 animate-spin" />}
              {chargement ? 'Traitement...' : 'Confirmer'}
            </button>
          </div>
        </div>
      )}

      {/* Étape 3 : succès */}
      {step === 'succes' && (
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <div className="w-16 h-16 bg-green-900/30 rounded-full flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-green-400" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">Paiement accepté !</h3>
            {ordreId && (
              <p className="text-sm text-slate-400 mt-1">
                N° {ordreId.slice(0, 8).toUpperCase()}
              </p>
            )}
            {methode === 'cash' && rendu > 0 && (
              <div className="mt-3 p-3 rounded-xl bg-green-900/20 border border-green-800">
                <p className="text-xs text-slate-400">Monnaie à rendre</p>
                <p className="text-2xl font-bold text-green-400">{fmt(rendu)}</p>
              </div>
            )}
          </div>
          <button onClick={onSuccess} className="btn-primary w-full h-11 mt-2">
            Nouvelle vente
          </button>
        </div>
      )}
    </Modal>
  );
}
