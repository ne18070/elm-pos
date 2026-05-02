'use client';
import { toUserError } from '@/lib/user-error';

import { useState, useEffect } from 'react';
import { X, Printer, XCircle, RotateCcw, AlertTriangle, CreditCard, Banknote, Smartphone, Loader2, FileText, MessageCircle, Link } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { formatCurrency } from '@/lib/utils';
import { printReceipt } from '@/lib/ipc';
import { generateInvoiceLink } from '@/lib/share-invoice';
import { triggerWhatsAppShare } from '@/lib/whatsapp-direct';
import { cancelOrder, refundOrder, getRefundsForOrder, completeOrderPayment } from '@services/supabase/orders';
import { logAction } from '@services/supabase/logger';
import { useAuthStore } from '@/store/auth';
import { canCancelOrders } from '@/lib/permissions';
import { useNotificationStore } from '@/store/notifications';
import { RefundModal } from './RefundModal';
import type { Order, OrderStatus, Refund, PaymentMethod } from '@pos-types';

interface OrderDetailProps {
  order: Order;
  currency: string;
  onClose: () => void;
  onRefresh: () => void;
  onPrint?: (order: Order) => void;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending:   'En attente',
  paid:      'Payée',
  cancelled: 'Annulée',
  refunded:  'Remboursée',
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending:   'bg-yellow-900/30 text-status-warning border-yellow-700',
  paid:      'bg-badge-success text-status-success border-status-success',
  cancelled: 'bg-badge-error text-status-error border-status-error',
  refunded:  'bg-badge-purple text-status-purple border-purple-700',
};

const METHOD_LABELS: Record<string, string> = {
  cash:         'Espèces',
  card:         'Carte',
  mobile_money: 'Mobile Money',
  partial:      'Acompte',
};

const PAYMENT_METHODES: Exclude<PaymentMethod, 'partial'>[] = ['cash', 'card', 'mobile_money'];

function getPaidAmount(order: Order): number {
  return (order.payments ?? []).reduce((s, p) => s + p.amount, 0);
}

function getRemainingAmount(order: Order): number {
  return Math.max(0, order.total - getPaidAmount(order));
}

function isAcompte(order: Order): boolean {
  if (order.status === 'cancelled' || order.status === 'refunded') return false;
  if ((order as { source?: string }).source === 'whatsapp') return false;
  return getRemainingAmount(order) > 0.01;
}

export function OrderDetail({ order, currency, onClose, onRefresh, onPrint }: OrderDetailProps) {
  const { business, user } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();
  const [showRefundModal, setShowRefundModal]     = useState(false);
  const [showCompleteForm, setShowCompleteForm]   = useState(false);
  const [completeMethod, setCompleteMethod]       = useState<Exclude<PaymentMethod, 'partial'>>('cash');
  const [completeAmount, setCompleteAmount]       = useState('');
  const [completing, setCompleting]               = useState(false);
  const [sharingWa, setSharingWa]                 = useState(false);
  const [copying, setCopying]                     = useState(false);
  const [refunds, setRefunds]                     = useState<Refund[]>([]);

  const fmt              = (n: number) => formatCurrency(n, currency);
  const isAdmin          = canCancelOrders(user?.role);
  const partial          = isAcompte(order);
  const paidAmt          = getPaidAmount(order);
  const remaining        = getRemainingAmount(order);
  const isWhatsAppPending = (order as { source?: string }).source === 'whatsapp' && order.status === 'pending';

  useEffect(() => {
    if (order.status === 'refunded') {
      getRefundsForOrder(order.id).then(setRefunds).catch(() => {});
    }
  }, [order.id, order.status]);

  // Pré-remplir le montant quand on ouvre le formulaire
  useEffect(() => {
    if (showCompleteForm) {
      setCompleteAmount(String(isWhatsAppPending ? order.total : remaining));
    }
  }, [showCompleteForm, remaining, isWhatsAppPending, order.total]);

  async function handleWhatsAppShare() {
    if (!order || !business) return;
    setSharingWa(true);
    try {
      const publicUrl = await generateInvoiceLink(order, business);
      const orderRef = order.id.slice(0, 8).toUpperCase();
      const greeting  = order.customer_name ? `Bonjour ${order.customer_name},` : 'Bonjour,';
      const text = `${greeting} voici votre facture n° *${orderRef}* 🧾\n\n` +
        `🔗 Télécharger le PDF : ${publicUrl}\n\n` +
        `Merci pour votre confiance ! 🙏`;

      triggerWhatsAppShare(order.customer_phone || '', text);
      success('Lien préparé pour WhatsApp');
    } catch (err) {
      notifError("Erreur lors de l'envoi WhatsApp");
    } finally {
      setSharingWa(false);
    }
  }

  async function handleCopyLink() {
    if (!order || !business) return;
    setCopying(true);
    try {
      const url = await generateInvoiceLink(order, business);
      await navigator.clipboard.writeText(url);
      success('Lien copié dans le presse-papier');
    } catch (err) {
      notifError("Erreur lors de la génération du lien");
    } finally {
      setCopying(false);
    }
  }

  async function handlePrint() {
    if (!business || !user) return;
    try {
      await printReceipt({ order, business, cashier_name: user.full_name });
      success("Reçu envoyé à l'imprimante");
    } catch (err) {
      notifError(toUserError(err));
    }
  }

  async function handleCancel() {
    if (!confirm('Annuler cette commande ?\n\nLe stock sera restauré et le coupon éventuellement appliqué sera annulé.')) return;
    try {
      await cancelOrder(order.id);
      logAction({
        business_id: order.business_id,
        action:      'order.cancelled',
        entity_type: 'order',
        entity_id:   order.id,
        user_id:     user?.id,
        user_name:   user?.full_name,
        metadata:    { total: order.total },
      });
      success('Commande annulée');
      onRefresh();
      onClose();
    } catch (err) {
      notifError(toUserError(err));
    }
  }

  async function handleRefund(amount: number, reason: string) {
    await refundOrder({
      orderId:    order.id,
      amount,
      reason:     reason || undefined,
      refundedBy: user?.id,
    });
    logAction({
      business_id: order.business_id,
      action:      'order.refunded',
      entity_type: 'order',
      entity_id:   order.id,
      user_id:     user?.id,
      user_name:   user?.full_name,
      metadata:    { amount, reason: reason || null },
    });
    success(`Remboursement de ${fmt(amount)} enregistré`);
    onRefresh();
    onClose();
  }

  async function handleCompletePayment() {
    const amount = parseFloat(completeAmount) || 0;
    if (amount <= 0) { notifError('Montant invalide'); return; }
    if (amount > remaining + 0.01) { notifError(`Montant supérieur au reste dû (${fmt(remaining)})`); return; }

    setCompleting(true);
    try {
      await completeOrderPayment({ orderId: order.id, method: completeMethod, amount });
      logAction({
        business_id: order.business_id,
        action:      'order.payment_completed',
        entity_type: 'order',
        entity_id:   order.id,
        user_id:     user?.id,
        user_name:   user?.full_name,
        metadata:    { amount, method: completeMethod, fully_paid: amount >= remaining - 0.01 },
      });
      success(`Paiement de ${fmt(amount)} enregistré${amount >= remaining - 0.01 ? ' —commande soldée !' : ''}`);
      onRefresh();
      onClose();
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setCompleting(false);
    }
  }

  return (
    <>
      <div className="w-80 border-l border-surface-border bg-surface-card flex flex-col h-full">
        {/* En-tête */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
          <div>
            <p className="font-semibold text-content-primary font-mono text-sm">
              #{order.id.slice(0, 8).toUpperCase()}
            </p>
            <p className="text-xs text-content-secondary">
              {format(new Date(order.created_at), 'dd MMM yyyy, HH:mm', { locale: fr })}
            </p>
          </div>
          <button onClick={onClose} className="text-content-secondary hover:text-content-primary">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenu */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Statut */}
          <div className="flex items-center justify-between">
            <p className="label">Statut</p>
            {partial ? (
              <span className="inline-flex px-3 py-1 rounded-lg text-xs font-medium border bg-badge-warning text-status-warning border-status-warning">
                Acompte versé
              </span>
            ) : (
              <span className={`inline-flex px-3 py-1 rounded-lg text-xs font-medium border ${STATUS_COLORS[order.status as OrderStatus]}`}>
                {STATUS_LABELS[order.status as OrderStatus]}
              </span>
            )}
          </div>

          {/* Client (acompte) */}
          {order.customer_name && (
            <div className="bg-badge-warning border border-status-warning rounded-xl px-3 py-2.5 space-y-0.5">
              <p className="label text-status-warning">Client</p>
              <p className="text-sm font-semibold text-content-primary">{order.customer_name}</p>
              {order.customer_phone && (
                <p className="text-sm text-content-secondary">{order.customer_phone}</p>
              )}
            </div>
          )}

          {/* Caissier */}
          <div>
            <p className="label">Caissier</p>
            <p className="text-sm text-content-primary">{order.cashier?.full_name ?? '—'}</p>
          </div>

          {/* Articles */}
          <div>
            <p className="label">Articles</p>
            <div className="space-y-2">
              {order.items?.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="text-content-primary truncate">{item.name}</p>
                    <p className="text-content-primary text-xs">{fmt(item.price)} —{item.quantity}</p>
                  </div>
                  <p className="text-content-primary font-medium shrink-0 ml-2">{fmt(item.total)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Totaux */}
          <div className="bg-surface-input rounded-xl p-3 space-y-1.5">
            <div className="flex justify-between text-sm text-content-secondary">
              <span>Sous-total</span>
              <span>{fmt(order.subtotal)}</span>
            </div>
            {order.discount_amount > 0 && (
              <div className="flex justify-between text-sm text-status-success">
                <span>Remise {order.coupon_code && `(${order.coupon_code})`}</span>
                <span>-{fmt(order.discount_amount)}</span>
              </div>
            )}
            {order.coupon_code && order.discount_amount === 0 && (
              <div className="flex justify-between text-sm text-status-warning">
                <span>Offre ({order.coupon_code})</span>
                <span>{order.coupon_notes ?? 'Article offert'}</span>
              </div>
            )}
            {order.tax_amount > 0 && (
              <div className="flex justify-between text-sm text-content-secondary">
                <span>TVA</span>
                <span>{fmt(order.tax_amount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-content-primary pt-1 border-t border-surface-border">
              <span>Total</span>
              <span>{fmt(order.total)}</span>
            </div>

            {/* Solde acompte */}
            {partial && (
              <>
                <div className="flex justify-between text-sm text-content-brand pt-1 border-t border-surface-border">
                  <span>Acompte versé</span>
                  <span className="font-medium">{fmt(paidAmt)}</span>
                </div>
                <div className="flex justify-between text-status-warning font-bold">
                  <span>Reste à régler</span>
                  <span className="text-lg">{fmt(remaining)}</span>
                </div>
              </>
            )}
          </div>

          {/* Paiements reçus */}
          {order.payments?.length > 0 && (
            <div>
              <p className="label">Paiements reçus</p>
              {order.payments.map((p) => (
                <div key={p.id} className="flex justify-between text-sm py-1">
                  <span className="text-content-secondary">{METHOD_LABELS[p.method] ?? p.method}</span>
                  <span className="text-content-primary">{fmt(p.amount)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Formulaire paiement complémentaire (acompte ou WhatsApp) */}
          {(partial || isWhatsAppPending) && showCompleteForm && (
            <div className="bg-badge-warning border border-status-warning rounded-xl p-3 space-y-3">
              <p className="text-xs text-status-warning font-medium uppercase tracking-wider">
                Enregistrer le solde ({fmt(remaining)})
              </p>

              {/* Méthode */}
              <div className="grid grid-cols-3 gap-1.5">
                {PAYMENT_METHODES.map((m) => (
                  <button
                    key={m}
                    onClick={() => setCompleteMethod(m)}
                    className={`flex flex-col items-center gap-1 py-2 rounded-lg border text-xs transition-all ${
                      completeMethod === m
                        ? 'border-brand-500 bg-badge-brand text-content-brand'
                        : 'border-slate-700 text-content-secondary hover:text-content-primary'
                    }`}
                  >
                    {m === 'cash'         && <Banknote className="w-4 h-4" />}
                    {m === 'card'         && <CreditCard className="w-4 h-4" />}
                    {m === 'mobile_money' && <Smartphone className="w-4 h-4" />}
                    <span>{m === 'cash' ? 'Espèces' : m === 'card' ? 'Carte' : 'Mobile'}</span>
                  </button>
                ))}
              </div>

              {/* Montant */}
              <div>
                <label className="text-xs text-content-secondary mb-1 block">Montant reçu</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={completeAmount}
                  onChange={(e) => setCompleteAmount(e.target.value)}
                  className="input text-center font-bold"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowCompleteForm(false)}
                  className="btn-secondary flex-1 h-9 text-sm"
                >
                  Annuler
                </button>
                <button
                  onClick={handleCompletePayment}
                  disabled={completing}
                  className="btn-primary flex-1 h-9 text-sm flex items-center justify-center gap-1.5"
                >
                  {completing && <Loader2 className="w-3 h-3 animate-spin" />}
                  Valider
                </button>
              </div>
            </div>
          )}

          {/* Historique remboursements */}
          {refunds.length > 0 && (
            <div>
              <p className="label">Remboursements</p>
              {refunds.map((r) => (
                <div key={r.id} className="text-sm py-1.5 border-b border-surface-border last:border-0">
                  <div className="flex justify-between">
                    <span className="text-status-purple font-medium">-{fmt(r.amount)}</span>
                    <span className="text-content-primary text-xs">
                      {format(new Date(r.refunded_at), 'dd/MM/yyyy HH:mm')}
                    </span>
                  </div>
                  {r.reason && <p className="text-xs text-content-primary mt-0.5">{r.reason}</p>}
                </div>
              ))}
            </div>
          )}

          {/* Alerte acompte */}
          {partial && !showCompleteForm && !isWhatsAppPending && (
            <div className="flex gap-2 p-3 bg-badge-warning border border-status-warning rounded-xl text-xs text-status-warning">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Acompte de <strong>{fmt(paidAmt)}</strong> versé. Reste à régler : <strong>{fmt(remaining)}</strong>.</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-surface-border space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handlePrint}
              className="btn-secondary flex items-center justify-center gap-2 h-10 text-xs"
            >
              <Printer className="w-4 h-4" />
              Reçu
            </button>
            <button
              onClick={() => onPrint?.(order)}
              className="btn-secondary flex items-center justify-center gap-2 h-10 text-xs"
            >
              <FileText className="w-4 h-4" />
              Facture
            </button>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleWhatsAppShare}
              disabled={sharingWa}
              className="flex items-center justify-center gap-1.5 h-10 rounded-xl border border-status-success bg-badge-success text-status-success hover:bg-badge-success transition-colors text-xs font-medium"
              title="Partager via WhatsApp"
            >
              {sharingWa ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
              WhatsApp
            </button>
            <button
              onClick={handleCopyLink}
              disabled={copying}
              className="btn-secondary flex items-center justify-center gap-1.5 h-10 text-xs font-medium"
              title="Copier le lien PDF"
            >
              {copying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link className="w-4 h-4" />}
              Lien PDF
            </button>
          </div>

          {/* Compléter le paiement —acompte */}
          {partial && !showCompleteForm && (
            <button
              onClick={() => setShowCompleteForm(true)}
              className="w-full flex items-center justify-center gap-2 h-10 rounded-xl
                         bg-amber-600 hover:bg-amber-500 text-content-primary font-medium text-sm transition-colors"
            >
              <CreditCard className="w-4 h-4" />
              Encaisser le solde ({fmt(remaining)})
            </button>
          )}

          {/* Payer —commande WhatsApp en attente */}
          {isWhatsAppPending && !showCompleteForm && (
            <button
              onClick={() => setShowCompleteForm(true)}
              className="w-full flex items-center justify-center gap-2 h-10 rounded-xl
                         bg-green-700 hover:bg-green-600 text-content-primary font-medium text-sm transition-colors"
            >
              <CreditCard className="w-4 h-4" />
              Payer ({fmt(order.total)})
            </button>
          )}

          {isAdmin && order.status === 'paid' && !partial && (
            <div className="flex gap-2">
              <button
                onClick={() => setShowRefundModal(true)}
                className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl
                           border border-purple-700 text-status-purple hover:bg-badge-purple transition-colors text-sm font-medium"
              >
                <RotateCcw className="w-4 h-4" />
                Rembourser
              </button>
              <button
                onClick={handleCancel}
                className="flex items-center justify-center gap-2 px-3 h-10 rounded-xl
                           border border-status-error text-status-error hover:bg-badge-error transition-colors"
                title="Annuler la commande"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          )}

          {isAdmin && (order.status === 'pending' || partial) && (
            <button
              onClick={handleCancel}
              className="btn-danger w-full flex items-center justify-center gap-2 h-10"
            >
              <XCircle className="w-4 h-4" />
              Annuler la commande
            </button>
          )}
        </div>
      </div>

      {showRefundModal && (
        <RefundModal
          order={order}
          currency={currency}
          onConfirm={handleRefund}
          onClose={() => setShowRefundModal(false)}
        />
      )}
    </>
  );
}
