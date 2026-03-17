'use client';

import { useState, useEffect } from 'react';
import { X, Printer, XCircle, RotateCcw, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { formatCurrency } from '@/lib/utils';
import { printReceipt } from '@/lib/ipc';
import { cancelOrder, refundOrder, getRefundsForOrder } from '@services/supabase/orders';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { RefundModal } from './RefundModal';
import type { Order, OrderStatus, Refund } from '@pos-types';

interface OrderDetailProps {
  order: Order;
  currency: string;
  onClose: () => void;
  onRefresh: () => void;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending:   'En attente',
  paid:      'Payée',
  cancelled: 'Annulée',
  refunded:  'Remboursée',
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending:   'bg-yellow-900/30 text-yellow-400 border-yellow-700',
  paid:      'bg-green-900/30 text-green-400 border-green-700',
  cancelled: 'bg-red-900/30 text-red-400 border-red-700',
  refunded:  'bg-purple-900/30 text-purple-400 border-purple-700',
};

const METHOD_LABELS: Record<string, string> = {
  cash:         'Espèces',
  card:         'Carte',
  mobile_money: 'Mobile Money',
  partial:      'Mixte',
};

export function OrderDetail({ order, currency, onClose, onRefresh }: OrderDetailProps) {
  const { business, user } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const fmt = (n: number) => formatCurrency(n, currency);
  const isAdmin = user?.role === 'owner' || user?.role === 'admin';

  useEffect(() => {
    if (order.status === 'refunded') {
      getRefundsForOrder(order.id).then(setRefunds).catch(() => {});
    }
  }, [order.id, order.status]);

  async function handlePrint() {
    if (!business || !user) return;
    try {
      await printReceipt({ order, business, cashier_name: user.full_name });
      success('Reçu envoyé à l\'imprimante');
    } catch (err) {
      notifError(String(err));
    }
  }

  async function handleCancel() {
    if (!confirm('Annuler cette commande ?\n\nLe stock sera restauré et le coupon éventuellement appliqué sera annulé.')) return;
    try {
      await cancelOrder(order.id);
      success('Commande annulée');
      onRefresh();
      onClose();
    } catch (err) {
      notifError(String(err));
    }
  }

  async function handleRefund(amount: number, reason: string) {
    await refundOrder({
      orderId:    order.id,
      amount,
      reason:     reason || undefined,
      refundedBy: user?.id,
    });
    success(`Remboursement de ${fmt(amount)} enregistré`);
    onRefresh();
    onClose();
  }

  return (
    <>
      <div className="w-80 border-l border-surface-border bg-surface-card flex flex-col h-full">
        {/* En-tête */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
          <div>
            <p className="font-semibold text-white font-mono text-sm">
              #{order.id.slice(0, 8).toUpperCase()}
            </p>
            <p className="text-xs text-slate-400">
              {format(new Date(order.created_at), 'dd MMM yyyy, HH:mm', { locale: fr })}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenu */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Statut */}
          <div className="flex items-center justify-between">
            <p className="label">Statut</p>
            <span className={`inline-flex px-3 py-1 rounded-lg text-xs font-medium border ${STATUS_COLORS[order.status as OrderStatus]}`}>
              {STATUS_LABELS[order.status as OrderStatus]}
            </span>
          </div>

          {/* Caissier */}
          <div>
            <p className="label">Caissier</p>
            <p className="text-sm text-white">{order.cashier?.full_name ?? '—'}</p>
          </div>

          {/* Articles */}
          <div>
            <p className="label">Articles</p>
            <div className="space-y-2">
              {order.items?.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="text-white truncate">{item.name}</p>
                    <p className="text-slate-500 text-xs">
                      {fmt(item.price)} × {item.quantity}
                    </p>
                  </div>
                  <p className="text-white font-medium shrink-0 ml-2">{fmt(item.total)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Totaux */}
          <div className="bg-surface-input rounded-xl p-3 space-y-1.5">
            <div className="flex justify-between text-sm text-slate-400">
              <span>Sous-total</span>
              <span>{fmt(order.subtotal)}</span>
            </div>
            {order.discount_amount > 0 && (
              <div className="flex justify-between text-sm text-green-400">
                <span>Remise {order.coupon_code && `(${order.coupon_code})`}</span>
                <span>-{fmt(order.discount_amount)}</span>
              </div>
            )}
            {order.tax_amount > 0 && (
              <div className="flex justify-between text-sm text-slate-400">
                <span>TVA</span>
                <span>{fmt(order.tax_amount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-white pt-1 border-t border-surface-border">
              <span>Total</span>
              <span>{fmt(order.total)}</span>
            </div>
          </div>

          {/* Paiements */}
          {order.payments?.length > 0 && (
            <div>
              <p className="label">Paiements reçus</p>
              {order.payments.map((p) => (
                <div key={p.id} className="flex justify-between text-sm py-1">
                  <span className="text-slate-400">{METHOD_LABELS[p.method] ?? p.method}</span>
                  <span className="text-white">{fmt(p.amount)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Historique remboursements */}
          {refunds.length > 0 && (
            <div>
              <p className="label">Remboursements</p>
              {refunds.map((r) => (
                <div key={r.id} className="text-sm py-1.5 border-b border-surface-border last:border-0">
                  <div className="flex justify-between">
                    <span className="text-purple-400 font-medium">-{fmt(r.amount)}</span>
                    <span className="text-slate-500 text-xs">
                      {format(new Date(r.refunded_at), 'dd/MM/yyyy HH:mm')}
                    </span>
                  </div>
                  {r.reason && <p className="text-xs text-slate-500 mt-0.5">{r.reason}</p>}
                </div>
              ))}
            </div>
          )}

          {/* Avertissement annulation commande en attente */}
          {order.status === 'pending' && (
            <div className="flex gap-2 p-3 bg-yellow-900/20 border border-yellow-800 rounded-xl text-xs text-yellow-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Cette commande est en attente de paiement.</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-surface-border space-y-2">
          <button
            onClick={handlePrint}
            className="btn-secondary w-full flex items-center justify-center gap-2 h-10"
          >
            <Printer className="w-4 h-4" />
            Réimprimer le reçu
          </button>

          {isAdmin && order.status === 'paid' && (
            <div className="flex gap-2">
              <button
                onClick={() => setShowRefundModal(true)}
                className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl
                           border border-purple-700 text-purple-400 hover:bg-purple-900/20 transition-colors text-sm font-medium"
              >
                <RotateCcw className="w-4 h-4" />
                Rembourser
              </button>
              <button
                onClick={handleCancel}
                className="flex items-center justify-center gap-2 px-3 h-10 rounded-xl
                           border border-red-800 text-red-400 hover:bg-red-900/20 transition-colors"
                title="Annuler la commande"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          )}

          {isAdmin && order.status === 'pending' && (
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
