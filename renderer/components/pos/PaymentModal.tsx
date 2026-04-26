'use client';

import { useEffect, useRef, useState } from 'react';
import { CreditCard, Banknote, Smartphone, Loader2, CheckCircle, SplitSquareHorizontal, MonitorCheck, User, Download, MessageCircle, BedDouble, Link } from 'lucide-react';
import { useCustomersStore } from '@/store/customers';
import type { SavedCustomer } from '@/store/customers';
import { Modal } from '@/components/ui/Modal';
import { NumpadModal } from '@/components/ui/NumpadModal';
import { useCartStore } from '@/store/cart';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { formatCurrency } from '@/lib/utils';
import { sendInvoiceViaWhatsApp } from '@/lib/share-invoice';
import type { WholesaleContext } from './WholesaleSelector';
import type { Order } from '@pos-types';
import { createOrder } from '@services/supabase/orders';
import { enqueueToSync, printReceipt, openCashDrawer } from '@/lib/ipc';
import { getIntouchConfig, processIntouchPayment, waitForPayment } from '@services/supabase/intouch';
import type { IntouchConfig, IntouchPaymentRequest, IntouchPaymentResponse } from '@services/supabase/intouch';
import { RoomPicker } from './RoomPicker';
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
import type { PaymentMethod, HotelReservation } from '@pos-types';

interface PaymentModalProps {
  taxRate: number;
  taxInclusive: boolean;
  currency: string;
  onClose: () => void;
  onSuccess: () => void;
  onPaymentConfirm?: (amountPaid: number, change: number, total: number) => void;
  wholesaleCtx?: WholesaleContext | null;
  prefilledCustomer?: { name: string; phone?: string | null } | null;
  tableId?: string;
}

type Step = 'methode' | 'montant' | 'partiel' | 'room' | 'attente' | 'succes' | 'intouch';

const SIMPLE_METHODES: PaymentMethod[] = ['cash', 'card', 'mobile_money'];
const PARTIAL_METHODES: Exclude<PaymentMethod, 'partial'>[] = ['cash', 'card', 'mobile_money'];

const BC_CHANNEL = 'elm-pos-display';

export function PaymentModal({ taxRate, taxInclusive, currency, onClose, onSuccess, onPaymentConfirm, wholesaleCtx, prefilledCustomer, tableId }: PaymentModalProps) {
  const [step, setStep]               = useState<Step>('methode');
  const [methode, setMethode]         = useState<PaymentMethod>('cash');
  const [montantRecu, setMontantRecu] = useState('');
  const [chargement, setChargement]   = useState(false);
  const [sendingWa, setSendingWa]     = useState(false);
  const [ordreId, setOrdreId]         = useState<string | null>(null);
  const [ordre, setOrdre]             = useState<Order | null>(null);
  const [erreur, setErreur]           = useState('');
  const [numpad, setNumpad]           = useState<'montant' | 'acompte' | 'acompteRecu' | 'intouch' | null>(null);

  const cart = useCartStore();
  const { user, business } = useAuthStore();
  const { success: notifSuccess, warning: notifWarning } = useNotificationStore();

  // Intouch
  const [intouchConfig, setIntouchConfig] = useState<IntouchConfig | null>(null);
  const [intouchPhone, setIntouchPhone]   = useState(prefilledCustomer?.phone ?? '');
  const [intouchProvider, setIntouchProvider] = useState<'WAVE' | 'ORANGE_MONEY' | 'FREE_MONEY'>('WAVE');

  // Hôtel
  const [selectedReservation, setSelectedReservation] = useState<HotelReservation | null>(null);

  // Charger config Intouch
  useEffect(() => {
    if (business?.id) {
      getIntouchConfig(business.id).then(setIntouchConfig).catch(() => {});
    }
  }, [business?.id]);

  // Paiement partiel (acompte)
  const [partialMethod, setPartialMethod]     = useState<Exclude<PaymentMethod, 'partial'>>('cash');
  const [acompte, setAcompte]                 = useState('');
  const [acompteRecu, setAcompteRecu]         = useState('');
  const [acompteConfirme, setAcompteConfirme] = useState(0);
  const [totalConfirme, setTotalConfirme]     = useState(0);

  // Informations client (acompte) —pré-rempli si un client est sélectionné dans le panier
  const [customerName, setCustomerName]         = useState(prefilledCustomer?.name ?? '');
  const [customerPhone, setCustomerPhone]       = useState(prefilledCustomer?.phone ?? '');
  const [customerSuggestions, setCustomerSuggestions] = useState<SavedCustomer[]>([]);
  const [showSuggestions, setShowSuggestions]         = useState(false);
  const [showPhoneSuggestions, setShowPhoneSuggestions] = useState(false);
  const suggestionsRef                                = useRef<HTMLDivElement>(null);

  const { search: searchCustomers, addOrUpdate: saveCustomer } = useCustomersStore();

  // Ref vers la fonction DB à appeler quand le client valide
  const submitRef = useRef<(() => Promise<void>) | null>(null);

  const fmt = (n: number) => formatCurrency(n, currency);
  const { subtotal, discountAmount, taxAmount, total } = computeOrderTotals(
    cart.items,
    cart.coupons,
    taxRate,
    taxInclusive
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

  // -- BroadcastChannel : écoute la validation du client --------------------
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

  // -- Envoi de la facture de confirmation à l'écran client ------------------
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

  // -- DB : paiement complet -------------------------------------------------
  async function submitSimple() {
    if (!user || !business) return;
    setChargement(true);
    try {
      const order = await createOrder({
        business_id:    business.id,
        cashier_id:     user.id,
        cart:           { items: cart.items, coupons: cart.coupons, discount_amount: discountAmount, notes: cart.notes },
        payment_method: methode,
        payment_amount: methode === 'cash' ? montantRecuNum : total,
        tax_rate:       taxRate,
        coupons:        cart.coupons,
        notes:          cart.notes,
        customer_name:  (methode === 'room_charge' ? selectedReservation?.guest?.full_name : customerName.trim()) || undefined,
        customer_phone: (methode === 'room_charge' ? selectedReservation?.guest?.phone : customerPhone.trim()) || undefined,
        hotel_reservation_id: selectedReservation?.id,
        table_id:       tableId,
      });
      if (customerName.trim() && methode !== 'room_charge') saveCustomer(customerName, customerPhone);
      setOrdreId(order.id);
      setOrdre(order);
      printReceipt({
        order,
        business,
        cashier_name: user.full_name,
        reseller_name:        wholesaleCtx?.reseller.name,
        reseller_client_name: wholesaleCtx?.client?.name,
        reseller_client_phone: wholesaleCtx?.client?.phone ?? undefined,
      }).catch(() => notifWarning('Reçu non imprimé —imprimante indisponible'));
      // Ouvre le tiroir-caisse uniquement pour les paiements en espèces
      if (methode === 'cash') openCashDrawer().catch(() => {});
      notifSuccess('Paiement enregistré avec succès');
      onPaymentConfirm?.(methode === 'cash' ? montantRecuNum : total, rendu, total);
      cart.clear();
      setStep('succes');
    } catch (err: any) {
      console.error('Order creation failed:', err);
      const dbPayload = buildOrderDbPayload({
        businessId:    business.id,
        cashierId:     user.id,
        cart:          { items: cart.items, coupons: cart.coupons, discount_amount: discountAmount, notes: cart.notes },
        paymentMethod: methode,
        paymentAmount: methode === 'cash' ? montantRecuNum : total,
        taxRate,
        taxInclusive,
        notes:         cart.notes,
        tableId:       tableId,
      });
      if (selectedReservation) {
        (dbPayload as any).hotel_reservation_id = selectedReservation.id;
      }
      await enqueueToSync('create_order', dbPayload);
      notifWarning('Hors ligne —vente enregistrée, synchronisation automatique à la reconnexion');
      cart.clear();
      setStep('succes');
    } finally {
      setChargement(false);
    }
  }

  // -- DB : Intouch ----------------------------------------------------------
  async function submitIntouch() {
    if (!user || !business) return;
    if (!intouchPhone.trim()) { setErreur('Numéro de téléphone requis'); return; }
    setChargement(true);
    setErreur('');
    try {
      const initRes = await processIntouchPayment({
        business_id: business.id,
        amount:      total,
        currency,
        phone:       intouchPhone.replace(/\s/g, ''),
        provider:    intouchProvider,
      });

      if (!initRes.success) {
        setErreur(initRes.error || 'Échec de l\'initialisation du paiement');
        setChargement(false);
        return;
      }

      // Attente du paiement (Polling)
      if (initRes.status === 'PENDING' && initRes.external_reference) {
          const finalRes = await waitForPayment(initRes.external_reference);
          if (finalRes.status === 'SUCCESS') {
              await submitSimple();
          } else {
              setErreur(finalRes.error || 'Le paiement n\'a pas été validé par le client');
          }
      } else if (initRes.status === 'SUCCESS') {
          await submitSimple();
      }
    } catch (err: any) {
      setErreur(err.message || 'Erreur lors du paiement');
    } finally {
      setChargement(false);
    }
  }

  // -- DB : acompte ----------------------------------------------------------
  async function submitAcompte() {
    if (!user || !business) return;
    setAcompteConfirme(acompteNum);
    setTotalConfirme(total);
    setChargement(true);
    try {
      const order = await createOrder({
        business_id:    business.id,
        cashier_id:     user.id,
        cart:           { items: cart.items, coupons: cart.coupons, discount_amount: discountAmount, notes: cart.notes },
        payment_method: 'partial',
        payment_amount: acompteNum,
        tax_rate:       taxRate,
        coupons:        cart.coupons,
        notes:          cart.notes,
        customer_name:  customerName.trim() || undefined,
        customer_phone: customerPhone.trim() || undefined,
        table_id:       tableId,
      });
      setOrdreId(order.id);
      setOrdre(order);
      // Sauvegarder le client pour la prochaine fois
      saveCustomer(customerName, customerPhone);
      notifSuccess(`Acompte de ${fmt(acompteNum)} enregistré`);
      onPaymentConfirm?.(acompteNum, renduAcompte, total);
      if (partialMethod === 'cash') openCashDrawer().catch(() => {});
      cart.clear();
      setStep('succes');
    } catch {
      const dbPayload = buildOrderDbPayload({
        businessId:    business.id,
        cashierId:     user.id,
        cart:          { items: cart.items, coupons: cart.coupons, discount_amount: discountAmount, notes: cart.notes },
        paymentMethod: 'partial',
        paymentAmount: acompteNum,
        taxRate,
        notes:         cart.notes,
        tableId:       tableId,
      });
      (dbPayload as Record<string, unknown>).customer_name  = customerName.trim() || null;
      (dbPayload as Record<string, unknown>).customer_phone = customerPhone.trim() || null;
      await enqueueToSync('create_order', dbPayload);
      saveCustomer(customerName, customerPhone);
      notifWarning('Hors ligne —acompte enregistré, synchronisation automatique à la reconnexion');
      cart.clear();
      setStep('succes');
    } finally {
      setChargement(false);
    }
  }

  // -- Pré-confirmation : valide, envoie au display, attend le client --------
  function preConfirmerSimple() {
    if (!user || !business) return;
    setErreur('');

    const orderError = validateOrderPayload({
      businessId:    business.id,
      cashierId:     user.id,
      cart:          { items: cart.items, coupons: cart.coupons, discount_amount: discountAmount, notes: cart.notes },
      paymentMethod: methode,
      paymentAmount: methode === 'cash' ? montantRecuNum : total,
      taxRate,
      taxInclusive,
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

  async function handleWhatsApp() {
    if (!ordre || !business || !user) return;
    setSendingWa(true);
    try {
      const res = await sendInvoiceViaWhatsApp(ordre, business, user.id);
      if (res.success) {
        notifSuccess('Facture envoyée par WhatsApp');
      } else {
        notifWarning(`Échec de l'envoi : ${res.error}`);
      }
    } catch (err) {
      notifWarning("Erreur lors de l'envoi WhatsApp");
    } finally {
      setSendingWa(false);
    }
  }

  const [copying, setCopying] = useState(false);
  async function handleCopyLink() {
    if (!ordre || !business) return;
    setCopying(true);
    try {
      const { generateInvoiceLink } = await import('@/lib/share-invoice');
      const url = await generateInvoiceLink(ordre, business);
      await navigator.clipboard.writeText(url);
      notifSuccess('Lien copié dans le presse-papier');
    } catch (err) {
      notifWarning('Erreur lors de la génération du lien');
    } finally {
      setCopying(false);
    }
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
      {/* -- Étape 1 : méthode ----------------------------------------------- */}
      {step === 'methode' && (
        <div className="space-y-5">
          <div>
            <p className="label">Total à encaisser</p>
            <p className="text-3xl font-bold text-content-brand">{fmt(total)}</p>
            {discountAmount > 0 && (
              <p className="text-xs text-status-success mt-0.5">Remise appliquée : -{fmt(discountAmount)}</p>
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
                      ? 'border-brand-500 bg-badge-brand text-content-brand'
                      : 'border-surface-border text-content-secondary hover:border-slate-500 hover:text-content-primary'
                    }`}
                >
                  {m === 'cash'         && <Banknote className="w-6 h-6" />}
                  {m === 'card'         && <CreditCard className="w-6 h-6" />}
                  {m === 'mobile_money' && <Smartphone className="w-6 h-6" />}
                  <span className="text-xs font-medium text-center">{PAYMENT_METHOD_LABELS[m]}</span>
                </button>
              ))}
              {(business?.type === 'hotel' || business?.features?.includes('hotel')) && (
                <button
                  onClick={() => setMethode('room_charge')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all
                    ${methode === 'room_charge'
                      ? 'border-indigo-500 bg-indigo-900/20 text-indigo-400'
                      : 'border-surface-border text-content-secondary hover:border-slate-500 hover:text-content-primary'
                    }`}
                >
                  <BedDouble className="w-6 h-6" />
                  <span className="text-xs font-medium text-center">{PAYMENT_METHOD_LABELS['room_charge']}</span>
                </button>
              )}
              <button
                onClick={() => setMethode('partial')}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all
                  ${'partial' === methode
                    ? 'border-amber-500 bg-badge-warning text-status-warning'
                    : 'border-surface-border text-content-secondary hover:border-slate-500 hover:text-content-primary'
                  }`}
              >
                <SplitSquareHorizontal className="w-6 h-6" />
                <span className="text-xs font-medium text-center">Acompte / Partiel</span>
              </button>
            </div>
          </div>

          <button
            onClick={() => {
              if (methode === 'partial') setStep('partiel');
              else if (methode === 'room_charge') setStep('room');
              else if (methode === 'mobile_money' && intouchConfig?.is_active) setStep('intouch');
              else setStep('montant');
            }}
            className="btn-primary w-full h-11"
          >
            Continuer
          </button>
        </div>
      )}

      {/* -- Étape 2a : paiement complet ------------------------------------- */}
      {step === 'montant' && (
        <div className="space-y-5">
          <div className="bg-surface-input rounded-xl p-3 space-y-1">
            <div className="flex justify-between text-sm text-content-secondary">
              <span>Sous-total</span><span>{fmt(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-sm text-status-success">
                <span>Remise</span><span>-{fmt(discountAmount)}</span>
              </div>
            )}
            {taxAmount > 0 && (
              <div className="flex justify-between text-sm text-content-secondary">
                <span>TVA</span><span>{fmt(taxAmount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-content-primary pt-1 border-t border-surface-border">
              <span>Total</span><span className="text-content-brand">{fmt(total)}</span>
            </div>
          </div>

          {methode === 'cash' && (
            <div>
              <label className="label">Montant reçu</label>
              <button
                onClick={() => { setNumpad('montant'); setErreur(''); }}
                className="input text-2xl font-bold text-center py-3 w-full cursor-pointer hover:border-brand-500 transition-colors"
              >
                {montantRecu || <span className="text-content-primary">Appuyer pour saisir</span>}
              </button>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {suggestions.map((v) => (
                  <button
                    key={v}
                    onClick={() => { setMontantRecu(String(v)); setErreur(''); }}
                    className={`btn-secondary py-1.5 text-xs ${montantRecuNum === v ? 'border border-brand-500 text-content-brand' : ''}`}
                  >
                    {fmt(v)}
                  </button>
                ))}
              </div>
              {montantRecu && montantRecuNum >= total && (
                <div className="mt-3 p-3 rounded-xl bg-badge-success border border-status-success text-center">
                  <p className="text-xs text-content-secondary">Monnaie à rendre</p>
                  <p className="text-2xl font-bold text-status-success">{fmt(rendu)}</p>
                </div>
              )}
            </div>
          )}

          {erreur && (
            <p className="text-sm text-status-error bg-badge-error border border-status-error rounded-xl px-3 py-2">{erreur}</p>
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

      {/* -- Étape 2b : acompte / paiement partiel --------------------------- */}
      {step === 'partiel' && (
        <div className="space-y-5">
          <div className="flex justify-between items-center bg-surface-input rounded-xl px-4 py-3">
            <span className="text-content-secondary text-sm">Total commande</span>
            <span className="text-2xl font-bold text-content-brand">{fmt(total)}</span>
          </div>

          {/* Informations client */}
          <div className="space-y-3">
            <p className="label">Informations client</p>

            {/* Nom avec autocomplete */}
            <div className="relative" ref={suggestionsRef}>
              <label className="text-xs text-content-secondary mb-1 block">
                Nom complet <span className="text-status-error">*</span>
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
                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-surface-card border border-slate-700 rounded-xl overflow-hidden shadow-xl">
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
                      <div className="w-7 h-7 rounded-full bg-badge-brand border border-brand-700 flex items-center justify-center shrink-0">
                        <User className="w-3.5 h-3.5 text-content-brand" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-content-primary font-medium truncate">{c.name}</p>
                        {c.phone && <p className="text-xs text-content-secondary">{c.phone}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Téléphone */}
            <div className="relative">
              <label className="text-xs text-content-secondary mb-1 block">Téléphone</label>
              <input
                type="tel"
                inputMode="tel"
                value={customerPhone}
                onChange={(e) => {
                  const v = e.target.value;
                  setCustomerPhone(v);
                  const results = searchCustomers(v);
                  setCustomerSuggestions(results);
                  setShowPhoneSuggestions(results.length > 0 && v.trim().length > 0);
                  setShowSuggestions(false);
                }}
                onFocus={() => {
                  if (customerPhone.trim()) {
                    const results = searchCustomers(customerPhone);
                    setCustomerSuggestions(results);
                    setShowPhoneSuggestions(results.length > 0);
                  }
                }}
                onBlur={() => setTimeout(() => setShowPhoneSuggestions(false), 150)}
                placeholder="Ex : 77 000 00 00"
                className="input"
                autoComplete="off"
              />

              {showPhoneSuggestions && (
                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-surface-card border border-slate-700 rounded-xl overflow-hidden shadow-xl">
                  {customerSuggestions.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={() => {
                        setCustomerName(c.name);
                        setCustomerPhone(c.phone ?? '');
                        setShowPhoneSuggestions(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-700 transition-colors text-left"
                    >
                      <div className="w-7 h-7 rounded-full bg-badge-brand border border-brand-700 flex items-center justify-center shrink-0">
                        <User className="w-3.5 h-3.5 text-content-brand" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-content-primary font-medium truncate">{c.name}</p>
                        {c.phone && <p className="text-xs text-content-secondary">{c.phone}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
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
                      ? 'border-brand-500 bg-badge-brand text-content-brand'
                      : 'border-surface-border text-content-secondary hover:border-slate-500 hover:text-content-primary'
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
            <button
              onClick={() => { setNumpad('acompte'); setErreur(''); }}
              className="input text-2xl font-bold text-center py-3 w-full cursor-pointer hover:border-brand-500 transition-colors"
            >
              {acompte || <span className="text-content-primary">Appuyer pour saisir</span>}
            </button>
          </div>

          {partialMethod === 'cash' && acompteNum > 0 && (
            <div>
              <label className="label">Montant reçu (espèces)</label>
              <button
                onClick={() => setNumpad('acompteRecu')}
                className="input text-xl font-bold text-center py-2.5 w-full cursor-pointer hover:border-brand-500 transition-colors"
              >
                {acompteRecu || <span className="text-content-primary">{fmt(acompteNum)}</span>}
              </button>
            </div>
          )}

          {acompteNum > 0 && (
            <div className="bg-slate-800/50 rounded-xl p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-content-secondary">Acompte versé</span>
                <span className="text-content-primary font-semibold">{fmt(acompteNum)}</span>
              </div>
              <div className="flex justify-between items-center border-t border-slate-700 pt-3">
                <span className="text-status-warning font-medium">Reste à régler</span>
                <span className="text-status-warning font-bold text-xl tabular-nums">{fmt(resteAPayer)}</span>
              </div>
              {renduAcompte > 0 && (
                <div className="flex justify-between text-sm border-t border-slate-700 pt-3">
                  <span className="text-status-success">Monnaie à rendre</span>
                  <span className="text-status-success font-bold">{fmt(renduAcompte)}</span>
                </div>
              )}
            </div>
          )}

          {erreur && (
            <p className="text-sm text-status-error bg-badge-error border border-status-error rounded-xl px-3 py-2">{erreur}</p>
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

      {/* -- Étape 2c : Note de chambre ------------------------------------- */}
      {step === 'room' && (
        <RoomPicker
          businessId={business?.id!}
          currency={currency}
          onSelect={(res) => {
            setSelectedReservation(res);
            preConfirmerSimple();
          }}
          onCancel={() => setStep('methode')}
        />
      )}

      {/* -- Étape 2d : Intouch ---------------------------------------------- */}
      {step === 'intouch' && (
        <div className="space-y-5">
          <div className="flex justify-between items-center bg-surface-input rounded-xl px-4 py-3">
            <span className="text-content-secondary text-sm">Total à payer</span>
            <span className="text-2xl font-bold text-content-brand">{fmt(total)}</span>
          </div>

          <div className="space-y-3">
            <p className="label">Opérateur Mobile Money</p>
            <div className="grid grid-cols-3 gap-2">
              {(['WAVE', 'ORANGE_MONEY', 'FREE_MONEY'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setIntouchProvider(p)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all
                    ${intouchProvider === p
                      ? 'border-brand-500 bg-badge-brand text-content-brand'
                      : 'border-surface-border text-content-secondary hover:border-slate-500 hover:text-content-primary'
                    }`}
                >
                  <span className="text-[10px] font-bold">{p.replace('_', ' ')}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Numéro de téléphone (Push)</label>
            <button
              onClick={() => { setNumpad('intouch'); setErreur(''); }}
              className="input text-2xl font-bold text-center py-3 w-full cursor-pointer hover:border-brand-500 transition-colors"
            >
              {intouchPhone || <span className="text-content-primary">7x xxx xx xx</span>}
            </button>
          </div>

          {erreur && (
            <p className="text-sm text-status-error bg-badge-error border border-status-error rounded-xl px-3 py-2">{erreur}</p>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep('methode')} className="btn-secondary flex-1 h-11">Retour</button>
            <button
              onClick={submitIntouch}
              disabled={chargement || !intouchPhone}
              className="btn-primary flex-1 h-11 flex items-center justify-center gap-2"
            >
              {chargement && <Loader2 className="w-4 h-4 animate-spin" />}
              {chargement ? 'Lancement...' : 'Payer maintenant'}
            </button>
          </div>
          <p className="text-[10px] text-content-primary text-center">
            Un message de confirmation sera envoyé sur le téléphone du client.
          </p>
        </div>
      )}

      {/* -- Étape 3 : attente validation client ----------------------------- */}
      {step === 'attente' && (
        <div className="flex flex-col items-center gap-6 py-8 text-center">
          <div className="relative">
            <div className="w-24 h-24 rounded-full border-4 border-brand-900 border-t-brand-400 animate-spin" />
            <MonitorCheck className="absolute inset-0 m-auto w-10 h-10 text-content-brand" />
          </div>

          <div>
            <h3 className="text-xl font-semibold text-content-primary">En attente du client</h3>
            <p className="text-sm text-content-secondary mt-1">
              Le client vérifie sa facture et appuie sur <strong className="text-content-brand">OK</strong> pour valider
            </p>
          </div>

          {chargement && (
            <div className="flex items-center gap-2 text-content-secondary text-sm">
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

      {/* -- Numpad ---------------------------------------------------------- */}
      {numpad === 'montant' && (
        <NumpadModal
          value={montantRecu}
          label="Montant reçu"
          hint={`Total : ${fmt(total)}`}
          onDigit={(v) => { setMontantRecu(v); setErreur(''); }}
          onClose={() => setNumpad(null)}
        />
      )}
      {numpad === 'acompte' && (
        <NumpadModal
          value={acompte}
          label="Montant versé"
          hint={`Total : ${fmt(total)}`}
          onDigit={(v) => { setAcompte(v); setErreur(''); }}
          onClose={() => setNumpad(null)}
        />
      )}
      {numpad === 'acompteRecu' && (
        <NumpadModal
          value={acompteRecu}
          label="Montant reçu (espèces)"
          hint={`Acompte : ${fmt(acompteNum)}`}
          onDigit={setAcompteRecu}
          onClose={() => setNumpad(null)}
        />
      )}
      {numpad === 'intouch' && (
        <NumpadModal
          value={intouchPhone}
          label="Téléphone client"
          hint="Format: 771234567"
          onDigit={setIntouchPhone}
          onClose={() => setNumpad(null)}
        />
      )}

      {/* -- Étape 4 : succès ------------------------------------------------ */}
      {step === 'succes' && (
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
            methode === 'partial' ? 'bg-badge-warning' : 'bg-badge-success'
          }`}>
            <CheckCircle className={`w-8 h-8 ${methode === 'partial' ? 'text-status-warning' : 'text-status-success'}`} />
          </div>

          <div className="w-full space-y-3">
            {methode === 'partial' ? (
              <>
                <h3 className="text-xl font-bold text-content-primary">Acompte enregistré !</h3>
                {ordreId && <p className="text-sm text-content-secondary">N° {ordreId.slice(0, 8).toUpperCase()}</p>}
                <div className="bg-surface-input rounded-xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-content-secondary">Total commande</span>
                    <span className="text-content-primary font-medium">{fmt(totalConfirme)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-secondary">Acompte reçu</span>
                    <span className="text-content-brand font-semibold">{fmt(acompteConfirme)}</span>
                  </div>
                  <div className="flex justify-between border-t border-surface-border pt-2">
                    <span className="text-status-warning font-medium">Reste à régler</span>
                    <span className="text-status-warning font-bold text-lg">{fmt(totalConfirme - acompteConfirme)}</span>
                  </div>
                </div>
                {renduAcompte > 0 && (
                  <div className="p-3 rounded-xl bg-badge-success border border-status-success">
                    <p className="text-xs text-content-secondary">Monnaie à rendre</p>
                    <p className="text-2xl font-bold text-status-success">{fmt(renduAcompte)}</p>
                  </div>
                )}
              </>
            ) : (
              <>
                <h3 className="text-xl font-bold text-content-primary">Paiement accepté !</h3>
                {ordreId && <p className="text-sm text-content-secondary">N° {ordreId.slice(0, 8).toUpperCase()}</p>}
                {methode === 'cash' && rendu > 0 && (
                  <div className="p-3 rounded-xl bg-badge-success border border-status-success">
                    <p className="text-xs text-content-secondary">Monnaie à rendre</p>
                    <p className="text-2xl font-bold text-status-success">{fmt(rendu)}</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Partage facture */}
          <div className="w-full space-y-2">
            <p className="text-xs text-content-primary text-center">Partager la facture</p>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => ordre && printReceipt({
                  order: ordre,
                  business: business!,
                  cashier_name: user!.full_name,
                  reseller_name:        wholesaleCtx?.reseller.name,
                  reseller_client_name: wholesaleCtx?.client?.name,
                  reseller_client_phone: wholesaleCtx?.client?.phone ?? undefined,
                })}
                disabled={!ordre}
                className="btn-secondary h-10 text-xs flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5 shrink-0" /> PDF
              </button>
              <button
                onClick={handleWhatsApp}
                disabled={!ordre || sendingWa}
                className="h-10 flex items-center justify-center gap-1.5 rounded-xl border border-status-success bg-badge-success text-status-success hover:bg-badge-success text-xs font-medium transition-colors"
              >
                {sendingWa ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5 shrink-0" />}
                WhatsApp
              </button>
              <button
                onClick={handleCopyLink}
                disabled={!ordre || copying}
                className="btn-secondary h-10 text-xs flex items-center justify-center gap-1.5"
                title="Copier le lien PDF"
              >
                {copying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link className="w-3.5 h-3.5 shrink-0" />}
                Lien
              </button>
            </div>
          </div>

          <button onClick={onSuccess} className="btn-primary w-full h-11">
            Nouvelle vente
          </button>
        </div>
      )}
    </Modal>
  );
}


