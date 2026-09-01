'use client';

import { useEffect, useRef, useState } from 'react';
import { CreditCard, Banknote, Smartphone, Loader2, CheckCircle, SplitSquareHorizontal, MonitorCheck, User, Download, MessageCircle, BedDouble, Link, Star, Gift, Truck } from 'lucide-react';
import { useCustomersStore } from '@/store/customers';
import type { SavedCustomer } from '@/store/customers';
import { Modal } from '@/components/ui/Modal';
import { NumpadModal } from '@/components/ui/NumpadModal';
import { useCartStore } from '@/store/cart';
import { useCashSessionStore } from '@/store/cashSession';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { formatCurrency } from '@/lib/utils';
import { sendInvoiceViaWhatsApp } from '@/lib/share-invoice';
import { copyTextToClipboard } from '@/lib/clipboard';
import type { WholesaleContext } from './WholesaleSelector';
import type { Order } from '@pos-types';
import { createOrder } from '@services/supabase/orders';
import { getLoyaltyConfig, getClientBalance, redeemPoints, type LoyaltyConfig } from '@services/supabase/loyalty';
import { enqueueToSync, printReceipt, openCashDrawer } from '@/lib/ipc';
import { getIntouchConfig, processIntouchPayment, waitForPayment } from '@services/supabase/intouch';
import type { IntouchConfig, IntouchPaymentRequest, IntouchPaymentResponse } from '@services/supabase/intouch';
import { RoomPicker } from './RoomPicker';
import {
  computeChange,
  suggestRoundAmounts,
  PAYMENT_METHOD_LABELS,
  MOBILE_MONEY_PROVIDER_LABELS,
  validatePayment,
  formatPaymentError,
  type MobileMoneyProvider,
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

type Step = 'methode' | 'montant' | 'partiel' | 'room' | 'attente' | 'succes' | 'intouch' | 'livraison_note';

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
  // Bon de livraison : commande livrée sans encaissement, réglée plus tard par l'admin
  const [deliveryNote, setDeliveryNote] = useState(false);
  const [deliveryNoteAddress, setDeliveryNoteAddress] = useState('');

  const cart = useCartStore();
  const orderChannel    = cart.orderChannel;
  const deliveryAddress = cart.deliveryAddress;
  const { session: cashSession } = useCashSessionStore();
  const { user, business } = useAuthStore();
  const { success: notifSuccess, warning: notifWarning, error: notifError } = useNotificationStore();

  // Référence de transaction (carte / mobile money manuel)
  const [txReference, setTxReference] = useState('');

  // Intouch
  const [intouchConfig, setIntouchConfig] = useState<IntouchConfig | null>(null);
  const [intouchPhone, setIntouchPhone]   = useState(prefilledCustomer?.phone ?? '');
  const [intouchProvider, setIntouchProvider] = useState<'WAVE' | 'ORANGE_MONEY' | 'FREE_MONEY'>('WAVE');

  // Hôtel
  const [selectedReservation, setSelectedReservation] = useState<HotelReservation | null>(null);
  // Ref for immediate access in async submit (Point 4)
  const reservationRef = useRef<HotelReservation | null>(null);

  // Charger config Intouch
  useEffect(() => {
    if (business?.id) {
      getIntouchConfig(business.id).then(setIntouchConfig).catch(e => {
        console.error('Failed to load Intouch config:', e);
        // Discrete warning or no-op is fine here since it's just a feature activation
      });
    }
  }, [business?.id]);

  // Paiement partiel (acompte)
  const [partialMethod, setPartialMethod]     = useState<Exclude<PaymentMethod, 'partial'>>('cash');
  const [acompte, setAcompte]                 = useState('');
  const [acompteRecu, setAcompteRecu]         = useState('');
  const [acompteConfirme, setAcompteConfirme] = useState(0);
  const [totalConfirme, setTotalConfirme]     = useState(0);

  // Informations client (acompte / bon de livraison) — pré-rempli si un client est déjà
  // sélectionné dans le panier (fiche client) ou via le sélecteur revendeur.
  const [customerName, setCustomerName]         = useState(prefilledCustomer?.name ?? wholesaleCtx?.client?.name ?? '');
  const [customerPhone, setCustomerPhone]       = useState(prefilledCustomer?.phone ?? wholesaleCtx?.client?.phone ?? '');
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

  // ── Fidélité ──────────────────────────────────────────────────────────────────
  const [loyaltyConfig,  setLoyaltyConfig]  = useState<LoyaltyConfig | null>(null);
  const [loyaltyBalance, setLoyaltyBalance] = useState(0);
  const [useLoyalty,     setUseLoyalty]     = useState(false);

  useEffect(() => {
    if (!business?.id || !customerName.trim()) { setLoyaltyConfig(null); setLoyaltyBalance(0); setUseLoyalty(false); return; }
    Promise.all([
      getLoyaltyConfig(business.id),
      getClientBalance(business.id, customerName.trim()),
    ]).then(([cfg, bal]) => {
      if (cfg.is_active) { setLoyaltyConfig(cfg); setLoyaltyBalance(bal); }
      else               { setLoyaltyConfig(null); setLoyaltyBalance(0); }
    }).catch(() => {});
  }, [business?.id, customerName]);

  const maxRedeemablePoints = loyaltyConfig
    ? Math.min(loyaltyBalance, Math.floor(total / loyaltyConfig.point_value))
    : 0;
  const loyaltyDiscount  = useLoyalty && loyaltyConfig ? maxRedeemablePoints * loyaltyConfig.point_value : 0;
  const canUseLoyalty    = !!loyaltyConfig && maxRedeemablePoints >= (loyaltyConfig.min_redeem ?? 1);
  const effectiveTotal   = Math.max(0, total - loyaltyDiscount);

  const montantRecuNum = parseFloat(montantRecu) || 0;
  const rendu          = methode === 'cash' && montantRecu ? computeChange(montantRecuNum, effectiveTotal) : 0;
  const suggestions    = suggestRoundAmounts(effectiveTotal);

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
    const reservation = reservationRef.current;
    try {
      // Construire les lignes de paiement (loyalty + méthode principale)
      const loyaltyPayments = useLoyalty && loyaltyDiscount > 0
        ? [{ method: 'loyalty', amount: loyaltyDiscount }]
        : [];
      const cashPaymentAmount = methode === 'cash' ? montantRecuNum : effectiveTotal;
      const mainPayments = effectiveTotal > 0
        ? [{ method: methode, amount: effectiveTotal }]
        : [];
      const allPayments = [...loyaltyPayments, ...mainPayments];

      const order = await createOrder({
        business_id:    business.id,
        cashier_id:     user.id,
        cart:           { items: cart.items, coupons: cart.coupons, discount_amount: discountAmount, notes: cart.notes },
        payment_method: effectiveTotal === 0 ? 'loyalty' as any : methode,
        payment_amount: effectiveTotal === 0 ? loyaltyDiscount : cashPaymentAmount,
        payments:       allPayments.length > 1 ? allPayments : undefined,
        tax_rate:       taxRate,
        tax_inclusive:  taxInclusive,
        coupons:        cart.coupons,
        notes:          cart.notes,
        customer_name:    (methode === 'room_charge' ? reservation?.guest?.full_name : customerName.trim()) || undefined,
        customer_phone:   (methode === 'room_charge' ? reservation?.guest?.phone : customerPhone.trim()) || undefined,
        hotel_reservation_id: reservation?.id,
        table_id:         tableId,
        reseller_id:        wholesaleCtx?.reseller.id ?? undefined,
        reseller_client_id: wholesaleCtx?.client?.id ?? undefined,
        order_channel:    orderChannel !== 'salle' ? orderChannel : undefined,
        delivery_address: deliveryAddress.trim() || undefined,
      });

      // Déduire les points fidélité après création de l'ordre
      if (useLoyalty && loyaltyConfig && maxRedeemablePoints >= loyaltyConfig.min_redeem && customerName.trim()) {
        try {
          await redeemPoints(business.id, customerName.trim(), customerPhone.trim() || null, maxRedeemablePoints, loyaltyConfig, undefined, order.id);
        } catch (e) {
          console.warn('[pos] loyalty redeem failed', e);
        }
      }
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
        loyalty: useLoyalty && loyaltyConfig && maxRedeemablePoints > 0 ? {
          points_used:  maxRedeemablePoints,
          discount:     loyaltyDiscount,
          new_balance:  Math.max(0, loyaltyBalance - maxRedeemablePoints),
        } : undefined,
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
        resellerId:       wholesaleCtx?.reseller.id ?? null,
        resellerClientId: wholesaleCtx?.client?.id ?? null,
      });
      if (reservation) {
        (dbPayload as any).hotel_reservation_id = reservation.id;
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
    if (!cashSession) { setErreur('Ouvrez une session de caisse avant d\'encaisser.'); return; }
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
        tax_inclusive:  taxInclusive,
        coupons:        cart.coupons,
        notes:          cart.notes,
        customer_name:  customerName.trim() || undefined,
        customer_phone: customerPhone.trim() || undefined,
        table_id:       tableId,
        reseller_id:        wholesaleCtx?.reseller.id ?? undefined,
        reseller_client_id: wholesaleCtx?.client?.id ?? undefined,
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
        resellerId:       wholesaleCtx?.reseller.id ?? null,
        resellerClientId: wholesaleCtx?.client?.id ?? null,
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

  // -- DB : bon de livraison (aucun encaissement) ---------------------------
  // Crée la commande en statut `pending` (0 F payé). Elle part directement dans
  // la file Livraisons et l'admin l'encaisse ensuite via « Encaisser le solde »
  // dans le détail de la commande.
  async function submitDeliveryNote() {
    if (!user || !business) return;
    setErreur('');
    if (!customerName.trim()) { setErreur('Le nom du client est obligatoire pour un bon de livraison'); return; }
    setTotalConfirme(total);
    setChargement(true);
    try {
      const order = await createOrder({
        business_id:    business.id,
        cashier_id:     user.id,
        cart:           { items: cart.items, coupons: cart.coupons, discount_amount: discountAmount, notes: cart.notes },
        payment_method: 'partial',
        payment_amount: 0,
        tax_rate:       taxRate,
        tax_inclusive:  taxInclusive,
        coupons:        cart.coupons,
        notes:          cart.notes,
        customer_name:  customerName.trim(),
        customer_phone: customerPhone.trim() || undefined,
        table_id:       tableId,
        reseller_id:        wholesaleCtx?.reseller.id ?? undefined,
        reseller_client_id: wholesaleCtx?.client?.id ?? undefined,
        order_channel:    'livraison',
        delivery_address: deliveryNoteAddress.trim() || deliveryAddress.trim() || undefined,
      });
      setOrdreId(order.id);
      setOrdre(order);
      saveCustomer(customerName, customerPhone);
      printReceipt({
        order,
        business,
        cashier_name:          user.full_name,
        reseller_name:         wholesaleCtx?.reseller.name,
        reseller_client_name:  wholesaleCtx?.client?.name,
        reseller_client_phone: wholesaleCtx?.client?.phone ?? undefined,
      }).catch(() => notifWarning('Reçu non imprimé —imprimante indisponible'));
      notifSuccess('Bon de livraison créé');
      cart.clear();
      setStep('succes');
    } catch {
      const dbPayload = buildOrderDbPayload({
        businessId:    business.id,
        cashierId:     user.id,
        cart:          { items: cart.items, coupons: cart.coupons, discount_amount: discountAmount, notes: cart.notes },
        paymentMethod: 'partial',
        paymentAmount: 0,
        taxRate,
        taxInclusive,
        notes:         cart.notes,
        tableId:       tableId,
        resellerId:       wholesaleCtx?.reseller.id ?? null,
        resellerClientId: wholesaleCtx?.client?.id ?? null,
      });
      (dbPayload as Record<string, unknown>).customer_name    = customerName.trim();
      (dbPayload as Record<string, unknown>).customer_phone   = customerPhone.trim() || null;
      (dbPayload as Record<string, unknown>).order_channel    = 'livraison';
      (dbPayload as Record<string, unknown>).delivery_address = deliveryNoteAddress.trim() || deliveryAddress.trim() || null;
      await enqueueToSync('create_order', dbPayload);
      saveCustomer(customerName, customerPhone);
      notifWarning('Hors ligne —bon de livraison enregistré, synchronisation automatique à la reconnexion');
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
    if (!cashSession) { setErreur('Ouvrez une session de caisse avant d\'encaisser.'); return; }

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

    const payError = effectiveTotal === 0 ? null : validatePayment({
      orderId:   'new',
      method:    methode,
      amount:    effectiveTotal,
      received:  methode === 'cash' ? montantRecuNum : undefined,
      reference: txReference.trim() || undefined,
      phone:     methode === 'mobile_money' ? (intouchPhone.trim() || undefined) : undefined,
    });
    if (payError) { setErreur(formatPaymentError(payError)); return; }

    submitRef.current = submitSimple;
    sendConfirmToDisplay();
    setStep('attente');
  }

  function preConfirmerAcompte() {
    if (!user || !business) return;
    setErreur('');

    if (!cashSession) { setErreur('Ouvrez une session de caisse avant d\'encaisser.'); return; }
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
      console.error('WhatsApp send error:', err);
      notifError("Erreur lors de l'envoi WhatsApp");
    } finally {
      setSendingWa(false);
    }
  }

  const [copying, setCopying] = useState(false);
  const [invoiceLink, setInvoiceLink] = useState('');
  async function handleCopyLink() {
    if (!ordre || !business) return;
    if (invoiceLink) {
      try {
        await copyTextToClipboard(invoiceLink);
        notifSuccess('Lien copié dans le presse-papier');
      } catch {
        notifWarning('Touchez le champ du lien puis copiez-le manuellement.');
      }
      return;
    }

    setCopying(true);
    try {
      const { generateInvoiceLink } = await import('@/lib/share-invoice');
      const url = await generateInvoiceLink(ordre, business);
      setInvoiceLink(url);
      try {
        await copyTextToClipboard(url);
        notifSuccess('Lien copié dans le presse-papier');
      } catch {
        notifWarning('Lien prêt. Appuyez encore sur "Lien" pour le copier.');
      }
    } catch (err) {
      console.error('Link generation error:', err);
      notifError('Erreur lors de la génération du lien');
    } finally {
      setCopying(false);
    }
  }

  return (
    <Modal
      title={step === 'succes'
        ? (deliveryNote ? 'Bon de livraison créé' : methode === 'partial' ? 'Acompte enregistré' : 'Paiement réussi')
        : step === 'attente'
          ? 'Validation client'
          : step === 'livraison_note'
            ? 'Bon de livraison'
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
            <p className="text-3xl font-bold text-content-brand">{fmt(effectiveTotal)}</p>
            {discountAmount > 0 && (
              <p className="text-xs text-status-success mt-0.5">Remise appliquée : -{fmt(discountAmount)}</p>
            )}
            {loyaltyDiscount > 0 && (
              <p className="text-xs text-yellow-500 mt-0.5 flex items-center gap-1">
                <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                Remise fidélité : -{fmt(loyaltyDiscount)}
              </p>
            )}
          </div>

          {/* Identification client pour fidélité */}
          <div>
            <label className="label">
              Client
              <span className="text-content-muted text-[10px] ml-1">(optionnel — active la fidélité)</span>
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => { setCustomerName(e.target.value); setUseLoyalty(false); }}
              placeholder="Ex : Mamadou Diallo"
              className="input"
            />
          </div>

          {/* Bouton fidélité */}
          {canUseLoyalty && (
            <button
              onClick={() => setUseLoyalty(v => !v)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors text-sm ${
                useLoyalty
                  ? 'bg-yellow-400/10 border-yellow-400/40 text-yellow-700 dark:text-yellow-300'
                  : 'bg-surface-input border-surface-border text-content-secondary hover:bg-surface-hover'
              }`}
            >
              <span className="flex items-center gap-2 font-semibold">
                <Gift className="w-4 h-4" />
                Utiliser les points de fidélité
              </span>
              <span className="flex items-center gap-1.5 text-xs font-bold">
                <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                {loyaltyBalance} pts → -{fmt(maxRedeemablePoints * loyaltyConfig!.point_value)}
              </span>
            </button>
          )}

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

          {!cashSession && (
            <p className="text-xs text-status-warning bg-badge-warning border border-status-warning rounded-xl px-3 py-2">
              Aucune session de caisse ouverte — seul le bon de livraison est possible.
            </p>
          )}

          {erreur && (
            <p className="text-sm text-status-error bg-badge-error border border-status-error rounded-xl px-3 py-2">{erreur}</p>
          )}

          <button
            onClick={() => {
              if (!cashSession) { setErreur('Ouvrez une session de caisse avant d\'encaisser.'); return; }
              if (methode === 'partial') setStep('partiel');
              else if (methode === 'room_charge') setStep('room');
              else if (effectiveTotal === 0) preConfirmerSimple();
              else if (methode === 'mobile_money' && intouchConfig?.is_active) setStep('intouch');
              else setStep('montant');
            }}
            disabled={!cashSession}
            className="btn-primary w-full h-11 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {effectiveTotal === 0 ? 'Confirmer (réglé par points)' : 'Continuer'}
          </button>

          {/* Bon de livraison : livrer maintenant, encaisser plus tard */}
          <div className="pt-1 border-t border-surface-border">
            <button
              onClick={() => {
                setDeliveryNote(true);
                setErreur('');
                setDeliveryNoteAddress(deliveryAddress);
                setStep('livraison_note');
              }}
              className="w-full h-11 flex items-center justify-center gap-2 rounded-xl border border-surface-border
                         text-content-secondary hover:border-brand-500 hover:text-content-brand transition-colors text-sm font-medium"
            >
              <Truck className="w-4 h-4" />
              Livrer sans encaisser · bon de livraison
            </button>
          </div>
        </div>
      )}

      {/* -- Étape : bon de livraison (sans encaissement) ------------------- */}
      {step === 'livraison_note' && (
        <div className="space-y-5">
          <div className="flex justify-between items-center bg-surface-input rounded-xl px-4 py-3">
            <span className="text-content-secondary text-sm">Total à régler plus tard</span>
            <span className="text-2xl font-bold text-content-brand">{fmt(total)}</span>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-xl bg-badge-warning border border-status-warning text-xs text-status-warning">
            <Truck className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Aucun encaissement maintenant. La commande part en livraison et l'administrateur
              encaissera la facture plus tard depuis le détail de la commande.
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-content-secondary mb-1 block">
                Nom du client <span className="text-status-error">*</span>
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => { setCustomerName(e.target.value); setErreur(''); }}
                placeholder="Ex : Mamadou Diallo"
                className="input"
                autoFocus
                autoComplete="off"
              />
            </div>

            <div>
              <label className="text-xs text-content-secondary mb-1 block">
                Téléphone <span className="text-content-muted text-[10px]">(optionnel)</span>
              </label>
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

            <div>
              <label className="text-xs text-content-secondary mb-1 block">
                Adresse de livraison <span className="text-content-muted text-[10px]">(optionnel)</span>
              </label>
              <input
                type="text"
                value={deliveryNoteAddress}
                onChange={(e) => setDeliveryNoteAddress(e.target.value)}
                placeholder="Ex : Sacré-Cœur 3, villa 12"
                className="input"
                autoComplete="off"
              />
            </div>
          </div>

          {erreur && (
            <p className="text-sm text-status-error bg-badge-error border border-status-error rounded-xl px-3 py-2">{erreur}</p>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => { setDeliveryNote(false); setErreur(''); setStep('methode'); }}
              className="btn-secondary flex-1 h-11"
            >
              Retour
            </button>
            <button
              onClick={submitDeliveryNote}
              disabled={chargement || !customerName.trim()}
              className="btn-primary flex-1 h-11 flex items-center justify-center gap-2"
            >
              {chargement && <Loader2 className="w-4 h-4 animate-spin" />}
              {chargement ? 'Traitement...' : 'Créer le bon de livraison'}
            </button>
          </div>
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
            {loyaltyDiscount > 0 && (
              <div className="flex justify-between text-sm text-yellow-500">
                <span className="flex items-center gap-1">
                  <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                  Fidélité ({maxRedeemablePoints} pts)
                </span>
                <span>-{fmt(loyaltyDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-content-primary pt-1 border-t border-surface-border">
              <span>Total</span><span className="text-content-brand">{fmt(effectiveTotal)}</span>
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
              {montantRecu && montantRecuNum >= effectiveTotal && (
                <div className="mt-3 p-3 rounded-xl bg-badge-success border border-status-success text-center">
                  <p className="text-xs text-content-secondary">Monnaie à rendre</p>
                  <p className="text-2xl font-bold text-status-success">{fmt(rendu)}</p>
                </div>
              )}
            </div>
          )}

          {/* Référence transaction (carte / mobile money sans Intouch) */}
          {(methode === 'card' || methode === 'mobile_money') && (
            <div className="space-y-3">
              {methode === 'mobile_money' && (
                <div>
                  <label className="label">Téléphone client <span className="text-content-muted text-[10px]">(optionnel)</span></label>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={intouchPhone}
                    onChange={(e) => { setIntouchPhone(e.target.value); setErreur(''); }}
                    placeholder="7x xxx xx xx"
                    className="input"
                  />
                </div>
              )}
              <div>
                <label className="label">
                  {methode === 'card' ? 'Référence carte' : 'Référence de transaction'}{' '}
                  <span className="text-content-muted text-[10px]">(optionnel)</span>
                </label>
                <input
                  type="text"
                  value={txReference}
                  onChange={(e) => { setTxReference(e.target.value); setErreur(''); }}
                  placeholder={methode === 'card' ? 'Ex : code TPE ou 4 derniers chiffres' : 'Ex : ID transaction Wave / Orange'}
                  className="input"
                />
              </div>
            </div>
          )}

          {erreur && (
            <p className="text-sm text-status-error bg-badge-error border border-status-error rounded-xl px-3 py-2">{erreur}</p>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep('methode')} className="btn-secondary flex-1 h-11">Retour</button>
            <button
              onClick={preConfirmerSimple}
              disabled={chargement || (methode === 'cash' && (!montantRecu || montantRecuNum < effectiveTotal))}
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
            reservationRef.current = res; // Set ref for immediate access (Point 4)
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
                  <span className="text-[10px] font-bold">
                    {MOBILE_MONEY_PROVIDER_LABELS[p.toLowerCase() as MobileMoneyProvider]}
                  </span>
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
            (deliveryNote || methode === 'partial') ? 'bg-badge-warning' : 'bg-badge-success'
          }`}>
            {deliveryNote
              ? <Truck className="w-8 h-8 text-status-warning" />
              : <CheckCircle className={`w-8 h-8 ${methode === 'partial' ? 'text-status-warning' : 'text-status-success'}`} />}
          </div>

          <div className="w-full space-y-3">
            {deliveryNote ? (
              <>
                <h3 className="text-xl font-bold text-content-primary">Bon de livraison créé !</h3>
                {ordreId && <p className="text-sm text-content-secondary">N° {ordreId.slice(0, 8).toUpperCase()}</p>}
                <div className="bg-surface-input rounded-xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-content-secondary">Total commande</span>
                    <span className="text-content-primary font-medium">{fmt(totalConfirme)}</span>
                  </div>
                  <div className="flex justify-between border-t border-surface-border pt-2">
                    <span className="text-status-warning font-medium">Reste à régler</span>
                    <span className="text-status-warning font-bold text-lg">{fmt(totalConfirme)}</span>
                  </div>
                </div>
                <p className="text-xs text-content-muted">
                  Visible dans Livraisons. L'administrateur encaissera la facture depuis le détail de la commande.
                </p>
              </>
            ) : methode === 'partial' ? (
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
            {invoiceLink && (
              <input
                readOnly
                value={invoiceLink}
                onFocus={(event) => event.currentTarget.select()}
                onClick={(event) => event.currentTarget.select()}
                className="input h-9 text-xs font-mono"
                aria-label="Lien PDF"
              />
            )}
          </div>

          <button onClick={onSuccess} className="btn-primary w-full h-11">
            Nouvelle vente
          </button>
        </div>
      )}
    </Modal>
  );
}
