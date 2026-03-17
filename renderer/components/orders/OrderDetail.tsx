'use client';

import { X, Printer, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { formatCurrency } from '@/lib/utils';
import { printReceipt } from '@/lib/ipc';
import { cancelOrder } from '@services/supabase/orders';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import type { Order, OrderStatus } from '@pos-types';

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

export function OrderDetail({ order, currency, onClose, onRefresh }: OrderDetailProps) {
  const { business, user } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();
  const fmt = (n: number) => formatCurrency(n, currency);

  async function handlePrint() {
    if (!business || !user) return;
    await printReceipt({ order, business, cashier_name: user.full_name });
    success('Reçu envoyé à l\'imprimante');
  }

  async function handleCancel() {
    if (!confirm('Annuler cette commande ?')) return;
    try {
      await cancelOrder(order.id);
      success('Commande annulée');
      onRefresh();
    } catch (err) {
      notifError(String(err));
    }
  }

  return (
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
        <div>
          <p className="label">Statut</p>
          <span className={`inline-flex px-3 py-1 rounded-lg text-sm font-medium ${
            order.status === 'paid'
              ? 'bg-green-900/30 text-green-400 border border-green-700'
              : order.status === 'cancelled'
              ? 'bg-red-900/30 text-red-400 border border-red-700'
              : 'bg-yellow-900/30 text-yellow-400 border border-yellow-700'
          }`}>
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
                <div>
                  <p className="text-white">{item.name}</p>
                  <p className="text-slate-500 text-xs">
                    {fmt(item.price)} × {item.quantity}
                  </p>
                </div>
                <p className="text-white font-medium">{fmt(item.total)}</p>
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
            <p className="label">Paiements</p>
            {order.payments.map((p) => (
              <div key={p.id} className="flex justify-between text-sm py-1">
                <span className="text-slate-400 capitalize">{p.method.replace('_', ' ')}</span>
                <span className="text-white">{fmt(p.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-surface-border flex gap-2">
        <button
          onClick={handlePrint}
          className="btn-secondary flex-1 flex items-center justify-center gap-2 h-10"
        >
          <Printer className="w-4 h-4" />
          Réimprimer
        </button>
        {order.status === 'paid' && (
          <button
            onClick={handleCancel}
            className="btn-danger flex items-center justify-center px-3 h-10"
          >
            <XCircle className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
