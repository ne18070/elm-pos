'use client';

import { useEffect, useRef, useState } from 'react';
import { CreditCard, Banknote, Smartphone, Loader2, CheckCircle, SplitSquareHorizontal, MonitorCheck, User } from 'lucide-react';
import { useCustomersStore } from '@/store/customers';
import type { SavedCustomer } from '@/store/customers';
import { Modal } from '@/components/ui/Modal';
import { useCartStore } from '@/store/cart';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { formatCurrency } from '@/lib/utils';
import { printReceipt } from '@/lib/ipc';
import { createOrder } from '@services/supabase/orders';
import { enqueueToSync } from '@/lib/ipc';
import {
  computeChange,
  suggestRoundAmounts,
  PAYMENT_METHOD_LABELS,
  validatePayment,
  formatPaymentError,
} from '@domain/payment.service';
import {
  validateOrderPayload,
  buildOrderDbPayload,
  computeOrderTotals,
  formatOrderError,
} from '@domain/order.service';
import type { PaymentMethod } from '@pos-types';

interface PaymentModalProps {
  taxRate: number;
  currency: string;
  onClose: () => void;
  onSuccess: () => void;
  onPaymentConfirm?: (amountPaid: number, change: number, total: number) => void;
}

type Step = 'methode' | 'montant' | 'partiel' | 'attente' | 'succes';

const SIMPLE_METHODES: PaymentMethod[] = ['cash', 'card', 'mobile_money'];
const PARTIAL_METHODES: Exclude<PaymentMethod, 'partial'>[] = ['cash', 'card', 'mobile_money'];

const BC_CHANNEL = 'elm-pos-display';

export function PaymentModal({ taxRate, currency, onClose, onSuccess, onPaymentConfirm }: PaymentModalProps) {
  const [step, setStep]               = useState<Step>('methode');
  const [methode, setMethode]         = useState<PaymentMethod>('cash');
  const [montantRecu, setMontantRecu] = useState('');
  const [chargement, setChargement]   = useState(false);
  const [ordreId, setOrdreId]         = useState<string | null>(null);
  const [erreur, setErreur]           = useState('');

  // Paiement partiel (acompte)
  const [partialMethod, setPartialMethod]     = useState<Exclude<PaymentMethod, 'partial'>>('cash');
  const [acompte, setAcompte]                 = useState('');
  const [acompteRecu, setAcompteRecu]         = useState('');
  const [acompteConfirme, setAcompteConfirme] = useState(0);
  const [totalConfirme, setTotalConfirme]     = useState(0);

  // Informations client (acompte)
  const [customerName, setCustomerName]         = useState('');
  const [customerPhone, setCustomerPhone]       = useState('');
  const [customerSuggestions, setCustomerSuggestions] = useState<SavedCustomer[]>([]);
  const [showSuggestions, setShowSuggestions]   = useState(false);
  const suggestionsRef                          = useRef<HTMLDivElement>(null);

  const { search: searchCustomers, addOrUpdate: saveCustomer } = useCustomersStore();

  // Ref vers la fonction DB à appeler quand le client valide
  const submitRef = useRef<(() => Promise<void>) | null>(null);

  const cart = useCartStore();
  const { user, business } = useAuthStore();
  const { success: notifSuccess, warning: notifWarning } = useNotificationStore();

  const fmt = (n: number) => formatCurrency(n, currency);
  const { subtotal, discountAmount, taxAmount, total } = computeOrderTotals(
    cart.items,
    cart.coupon,
    taxRate
  );

  const montantRecuNum = parseFloat(montantRecu) || 0;
  const rendu          = methode === 'cash' && montantRecu ? computeChange(montantRecuNum, total) : 0;
  const suggestions    = suggestRoundAmounts(total);

  const acompteNum     = parseFloat(acompte) || 0;
  const acompteRecuNum = parseFloat(acompteRecu) || 0;
  const resteAPayer    = Math.max(0, Math.round((total - acompteNum) * 100) / 100);
  const renduAcompte   = partialMethod === 'cash' && acompteRecuNum > acompteNum
    ? Math.round((acompteRecuNum - acompteNum) * 100) / 100
    : 0;

  // ── BroadcastChannel : écoute la validation du client ────────────────────
  useEffect(() => {
    if (step !== 'attente') return;
    const bc = new BroadcastChannel(BC_CHANNEL);
    bc.onmessage = (e: MessageEvent) => {
      if (e.data === 'customer-confirmed') {
        bc.close();
        submitRef.current?.();
      }
    };
    return () => bc.close();
  }, [step]);

  // ── Envoi de la facture de confirmation à l'écran client ──────────────────
  function sendConfirmToDisplay(amountPaid?: number) {
    const state = {
      screen:       'confirm',
      businessName: business?.name,
      logoUrl:      business?.logo_url,
      currency,
      items: cart.items.map((i) => ({
        name:     i.name,
        price:    i.price,
        quantity: i.quantity,
        total:    i.price * i.quantity,
      })),
      subtotal,
      discount:    discountAmount > 0 ? discountAmount : undefined,
      tax:         taxAmount > 0 ? taxAmount : undefined,
      total,
      amountPaid,
    };
    // BroadcastChannel direct
    const bc = new BroadcastChannel(BC_CHANNEL);
    bc.postMessage(state);
    setTimeout(() => bc.close(), 200);
    // IPC fallback
    window.electronAPI?.display?.sendUpdate(state);
  }

  // ── DB : paiement complet ─────────────────────────────────────────────────
  async function submitSimple() {
    if (!user || !business) return;
    setChargement(true);
    try {
      const order = await createOrder({
        business_id:    business.id,
        cashier_id:     user.id,
        cart:           { items: cart.items, coupon: cart.coupon ?? undefined, discount_amount: discountAmount, notes: cart.notes },
        payment_method: methode,
        payment_amount: methode === 'cash' ? montantRecuNum : total,
        tax_rate:       taxRate,
        coupon:         cart.coupon ?? undefined,
        notes:          cart.notes,
      });
      setOrdreId(order.id);
      printReceipt({ order, business, cashier_name: user.full_name }).catch(() =>
        notifWarning('Reçu non imprimé — imprimante indisponible')
      );
      notifSuccess('Paiement enregistré avec succès');
      onPaymentConfirm?.(methode === 'cash' ? montantRecuNum : total, rendu, total);
      cart.clear();
      setStep('succes');
    } catch {
      const dbPayload = buildOrderDbPayload({
        businessId:    business.id,
        cashierId:     user.id,
        cart:          { items: cart.items, coupon: cart.coupon ?? undefined, discount_amount: discountAmount, notes: cart.notes },
        paymentMethod: methode,
        paymentAmount: methode === 'cash' ? montantRecuNum : total,
        taxRate,
        notes:         cart.notes,
      });
      await enqueueToSync('create_order', dbPayload);
      notifWarning('Hors ligne — vente enregistrée, synchronisation automatique à la reconnexion');
      cart.clear();
      setStep('succes');
    } finally {
      setChargement(false);
    }
  }

  // ── DB : acompte ──────────────────────────────────────────────────────────
  async function submitAcompte() {
    if (!user || !business) return;
    setAcompteConfirme(acompteNum);
    setTotalConfirme(total);
    setChargement(true);
    try {
      const order = await createOrder({
        business_id:    business.id,
        cashier_id:     user.id,
        cart:           { items: cart.items, coupon: cart.coupon ?? undefined, discount_amount: discountAmount, notes: cart.notes },
        payment_method: 'partial',
        payment_amount: acompteNum,
        tax_rate:       taxRate,
        coupon:         cart.coupon ?? undefined,
        notes:          cart.notes,
        customer_name:  customerName.trim() || undefined,
        customer_phone: customerPhone.trim() || undefined,
      });
      setOrdreId(order.id);
      // Sauvegarder le client pour la prochaine fois
      saveCustomer(customerName, customerPhone);
      notifSuccess(`Acompte de ${fmt(acompteNum)} enregistré`);
      onPaymentConfirm?.(acompteNum, renduAcompte, total);
      cart.clear();
      setStep('succes');
    } catch {
      const dbPayload = buildOrderDbPayload({
        businessId:    business.id,
        cashierId:     user.id,
        cart:          { items: cart.items, coupon: cart.coupon ?? undefined, discount_amount: discountAmount, notes: cart.notes },
        paymentMethod: 'partial',
        paymentAmount: acompteNum,
        taxRate,
        notes:         cart.notes,
      });
      (dbPayload as Record<string, unknown>).customer_name  = customerName.trim() || null;
      (dbPayload as Record<string, unknown>).customer_phone = customerPhone.trim() || null;
      await enqueueToSync('create_order', dbPayload);
      saveCustomer(customerName, customerPhone);
      notifWarning('Hors ligne — acompte enregistré, synchronisation automatique à la reconnexion');
      cart.clear();
      setStep('succes');
    } finally {
      setChargement(false);
    }
  }

  // ── Pré-confirmation : valide, envoie au display, attend le client ────────
  function preConfirmerSimple() {
    if (!user || !business) return;
    setErreur('');

    const orderError = validateOrderPayload({
      businessId:    business.id,
      cashierId:     user.id,
      cart:          { items: cart.items, coupon: cart.coupon ?? undefined, discount_amount: discountAmount, notes: cart.notes },
      paymentMethod: methode,
      paymentAmount: methode === 'cash' ? montantRecuNum : total,
      taxRate,
    });
    if (orderError) { setErreur(formatOrderError(orderError)); return; }

    const payError = validatePayment({
      orderId:  'new',
      method:   methode,
      amount:   total,
      received: methode === 'cash' ? montantRecuNum : undefined,
    });
    if (payError) { setErreur(formatPaymentError(payError)); return; }

    submitRef.current = submitSimple;
    sendConfirmToDisplay();
    setStep('attente');
  }

  function preConfirmerAcompte() {
    if (!user || !business) return;
    setErreur('');

    if (!customerName.trim()) { setErreur('Le nom du client est obligatoire pour un acompte'); return; }
    if (acompteNum <= 0) { setErreur('Veuillez saisir un montant'); return; }
    if (acompteNum >= total - 0.01) { setErreur('Pour un paiement complet, utilisez un autre mode'); return; }
    if (partialMethod === 'cash' && acompteRecu && acompteRecuNum < acompteNum - 0.01) {
      setErreur('Montant reçu insuffisant'); return;
    }

    submitRef.current = submitAcompte;
    sendConfirmToDisplay(acompteNum);
    setStep('attente');
  }

  return (
    <Modal
      title={step === 'succes'
        ? (methode === 'partial' ? 'Acompte enregistré' : 'Paiement réussi')
        : step === 'attente'
          ? 'Validation client'
          : 'Encaissement'}
      onClose={onClose}
      size="sm"
      guard={step !== 'succes'}
    >
      {/* ── Étape 1 : méthode ─────────────────────────────────────────────── */}
      {step === 'methode' && (
        <div className="space-y-5">
          <div>
            <p className="label">Total à encaisser</p>
            <p className="text-3xl font-bold text-brand-400">{fmt(total)}</p>
            {discountAmount > 0 && (
              <p className="text-xs text-green-400 mt-0.5">Remise appliquée : -{fmt(discountAmount)}</p>
            )}
          </div>

          <div>
            <p className="label">Moyen de paiement</p>
            <div className="grid grid-cols-2 gap-3">
              {SIMPLE_METHODES.map((m) => (
                <button
                  key={m}
                  onClick={() => setMethode(m)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all
                    ${methode === m
                      ? 'border-brand-500 bg-brand-900/30 text-brand-400'
                      : 'border-surface-border text-slate-400 hover:border-slate-500 hover:text-white'
                    }`}
                >
                  {m === 'cash'         && <Banknote className="w-6 h-6" />}
                  {m === 'card'         && <CreditCard className="w-6 h-6" />}
                  {m === 'mobile_money' && <Smartphone className="w-6 h-6" />}
                  <span className="text-xs font-medium text-center">{PAYMENT_METHOD_LABELS[m]}</span>
                </button>
              ))}
              <button
                onClick={() => setMethode('partial')}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all
                  ${'partial' === methode
                    ? 'border-amber-500 bg-amber-900/20 text-amber-400'
                    : 'border-surface-border text-slate-400 hover:border-slate-500 hover:text-white'
                  }`}
              >
                <SplitSquareHorizontal className="w-6 h-6" />
                <span className="text-xs font-medium text-center">Acompte / Partiel</span>
              </button>
            </div>
          </div>

          <button
            onClick={() => methode === 'partial' ? setStep('partiel') : setStep('montant')}
            className="btn-primary w-full h-11"
          >
            Continuer
          </button>
        </div>
      )}

      {/* ── Étape 2a : paiement complet ───────────────────────────────────── */}
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
              <div className="grid grid-cols-4 gap-2 mt-2">
                {suggestions.map((v) => (
                  <button
                    key={v}
                    onClick={() => setMontantRecu(String(v))}
                    className={`btn-secondary py-1.5 text-xs ${montantRecuNum === v ? 'border border-brand-500 text-brand-400' : ''}`}
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
            <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-xl px-3 py-2">{erreur}</p>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep('methode')} className="btn-secondary flex-1 h-11">Retour</button>
            <button
              onClick={preConfirmerSimple}
              disabled={chargement || (methode === 'cash' && (!montantRecu || montantRecuNum < total))}
              className="btn-primary flex-1 h-11 flex items-center justify-center gap-2"
            >
              {chargement && <Loader2 className="w-4 h-4 animate-spin" />}
              {chargement ? 'Traitement...' : 'Confirmer'}
            </button>
          </div>
        </div>
      )}

      {/* ── Étape 2b : acompte / paiement partiel ─────────────────────────── */}
      {step === 'partiel' && (
        <div className="space-y-5">
          <div className="flex justify-between items-center bg-surface-input rounded-xl px-4 py-3">
            <span className="text-slate-400 text-sm">Total commande</span>
            <span className="text-2xl font-bold text-brand-400">{fmt(total)}</span>
          </div>

          {/* Informations client */}
          <div className="space-y-3">
            <p className="label">Informations client</p>

            {/* Nom avec autocomplete */}
            <div className="relative" ref={suggestionsRef}>
              <label className="text-xs text-slate-400 mb-1 block">
                Nom complet <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => {
                  const v = e.target.value;
                  setCustomerName(v);
                  setErreur('');
                  const results = searchCustomers(v);
                  setCustomerSuggestions(results);
                  setShowSuggestions(results.length > 0);
                }}
                onFocus={() => {
                  const results = searchCustomers(customerName);
                  setCustomerSuggestions(results);
                  setShowSuggestions(results.length > 0);
                }}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="Ex : Mamadou Diallo"
                className="input"
                autoFocus
                autoComplete="off"
              />

              {/* Dropdown suggestions */}
              {showSuggestions && (
                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-xl">
                  {customerSuggestions.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={() => {
                        setCustomerName(c.name);
                        setCustomerPhone(c.phone ?? '');
                        setShowSuggestions(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-700 transition-colors text-left"
                    >
                      <div className="w-7 h-7 rounded-full bg-brand-900/50 border border-brand-700 flex items-center justify-center shrink-0">
                        <User className="w-3.5 h-3.5 text-brand-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-white font-medium truncate">{c.name}</p>
                        {c.phone && <p className="text-xs text-slate-400">{c.phone}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Téléphone */}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Téléphone</label>
              <input
                type="tel"
                inputMode="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Ex : 77 000 00 00"
                className="input"
                autoComplete="off"
              />
            </div>
          </div>

          <div>
            <p className="label">Méthode de paiement de l'acompte</p>
            <div className="grid grid-cols-3 gap-2">
              {PARTIAL_METHODES.map((m) => (
                <button
                  key={m}
                  onClick={() => setPartialMethod(m)}
                  className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs transition-all
                    ${partialMethod === m
                      ? 'border-brand-500 bg-brand-900/30 text-brand-400'
                      : 'border-surface-border text-slate-400 hover:border-slate-500 hover:text-white'
                    }`}
                >
                  {m === 'cash'         && <Banknote className="w-5 h-5" />}
                  {m === 'card'         && <CreditCard className="w-5 h-5" />}
                  {m === 'mobile_money' && <Smartphone className="w-5 h-5" />}
                  <span className="font-medium">{PAYMENT_METHOD_LABELS[m]}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Montant versé maintenant</label>
            <input
              type="number"
              inputMode="decimal"
              value={acompte}
              onChange={(e) => { setAcompte(e.target.value); setErreur(''); }}
              placeholder="0"
              className="input text-2xl font-bold text-center py-3"
              autoFocus
            />
          </div>

          {partialMethod === 'cash' && acompteNum > 0 && (
            <div>
              <label className="label">Montant reçu (espèces)</label>
              <input
                type="number"
                inputMode="decimal"
                value={acompteRecu}
                onChange={(e) => setAcompteRecu(e.target.value)}
                placeholder={fmt(acompteNum)}
                className="input text-center"
              />
            </div>
          )}

          {acompteNum > 0 && (
            <div className="bg-slate-800/50 rounded-xl p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Acompte versé</span>
                <span className="text-white font-semibold">{fmt(acompteNum)}</span>
              </div>
              <div className="flex justify-between items-center border-t border-slate-700 pt-3">
                <span className="text-amber-400 font-medium">Reste à régler</span>
                <span className="text-amber-400 font-bold text-xl tabular-nums">{fmt(resteAPayer)}</span>
              </div>
              {renduAcompte > 0 && (
                <div className="flex justify-between text-sm border-t border-slate-700 pt-3">
                  <span className="text-green-400">Monnaie à rendre</span>
                  <span className="text-green-400 font-bold">{fmt(renduAcompte)}</span>
                </div>
              )}
            </div>
          )}

          {erreur && (
            <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-xl px-3 py-2">{erreur}</p>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep('methode')} className="btn-secondary flex-1 h-11">Retour</button>
            <button
              onClick={preConfirmerAcompte}
              disabled={
                chargement ||
                acompteNum <= 0 ||
                acompteNum >= total - 0.01 ||
                (partialMethod === 'cash' && !!acompteRecu && acompteRecuNum < acompteNum - 0.01)
              }
              className="btn-primary flex-1 h-11 flex items-center justify-center gap-2"
            >
              {chargement && <Loader2 className="w-4 h-4 animate-spin" />}
              {chargement ? 'Traitement...' : "Confirmer l'acompte"}
            </button>
          </div>
        </div>
      )}

      {/* ── Étape 3 : attente validation client ───────────────────────────── */}
      {step === 'attente' && (
        <div className="flex flex-col items-center gap-6 py-8 text-center">
          <div className="relative">
            <div className="w-24 h-24 rounded-full border-4 border-brand-900 border-t-brand-400 animate-spin" />
            <MonitorCheck className="absolute inset-0 m-auto w-10 h-10 text-brand-400" />
          </div>

          <div>
            <h3 className="text-xl font-semibold text-white">En attente du client</h3>
            <p className="text-sm text-slate-400 mt-1">
              Le client vérifie sa facture et appuie sur <strong className="text-brand-400">OK</strong> pour valider
            </p>
          </div>

          {chargement && (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Enregistrement en cours…
            </div>
          )}

          {/* Bypass si l'écran client n'est pas disponible */}
          {!chargement && (
            <button
              onClick={() => submitRef.current?.()}
              className="btn-secondary text-sm px-6"
            >
              Valider sans confirmation client
            </button>
          )}
        </div>
      )}

      {/* ── Étape 4 : succès ──────────────────────────────────────────────── */}
      {step === 'succes' && (
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
            methode === 'partial' ? 'bg-amber-900/30' : 'bg-green-900/30'
          }`}>
            <CheckCircle className={`w-8 h-8 ${methode === 'partial' ? 'text-amber-400' : 'text-green-400'}`} />
          </div>

          <div className="w-full space-y-3">
            {methode === 'partial' ? (
              <>
                <h3 className="text-xl font-bold text-white">Acompte enregistré !</h3>
                {ordreId && <p className="text-sm text-slate-400">N° {ordreId.slice(0, 8).toUpperCase()}</p>}
                <div className="bg-surface-input rounded-xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Total commande</span>
                    <span className="text-white font-medium">{fmt(totalConfirme)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Acompte reçu</span>
                    <span className="text-brand-400 font-semibold">{fmt(acompteConfirme)}</span>
                  </div>
                  <div className="flex justify-between border-t border-surface-border pt-2">
                    <span className="text-amber-400 font-medium">Reste à régler</span>
                    <span className="text-amber-400 font-bold text-lg">{fmt(totalConfirme - acompteConfirme)}</span>
                  </div>
                </div>
                {renduAcompte > 0 && (
                  <div className="p-3 rounded-xl bg-green-900/20 border border-green-800">
                    <p className="text-xs text-slate-400">Monnaie à rendre</p>
                    <p className="text-2xl font-bold text-green-400">{fmt(renduAcompte)}</p>
                  </div>
                )}
              </>
            ) : (
              <>
                <h3 className="text-xl font-bold text-white">Paiement accepté !</h3>
                {ordreId && <p className="text-sm text-slate-400">N° {ordreId.slice(0, 8).toUpperCase()}</p>}
                {methode === 'cash' && rendu > 0 && (
                  <div className="p-3 rounded-xl bg-green-900/20 border border-green-800">
                    <p className="text-xs text-slate-400">Monnaie à rendre</p>
                    <p className="text-2xl font-bold text-green-400">{fmt(rendu)}</p>
                  </div>
                )}
              </>
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
