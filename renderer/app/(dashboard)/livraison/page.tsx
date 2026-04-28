'use client';
import { toUserError } from '@/lib/user-error';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Truck, Clock, CheckCircle, Package, UserCheck, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { formatCurrency } from '@/lib/utils';
import { OrderVerification } from '@/components/livraison/OrderVerification';
import {
  getOrdersForDelivery,
  startOrderPicking,
  confirmOrderDelivery,
} from '@services/supabase/orders';
import {
  getLivreurs,
  assignLivreur,
  sendLocationToLivreur,
  sendDeliveryConfirmationToClient,
  type Livreur,
} from '@services/supabase/livreurs';
import { getWhatsAppConfig } from '@services/supabase/whatsapp';
import { supabase } from '@/lib/supabase';
import type { Order } from '@pos-types';

const DELIVERY_LABELS = {
  pending:   { label: 'En attente',  color: 'text-status-warning bg-yellow-900/20 border-yellow-800' },
  picking:   { label: 'En cours',    color: 'text-content-brand bg-badge-brand border-brand-800'   },
  delivered: { label: 'Livré',       color: 'text-status-success bg-badge-success border-status-success'   },
};

export default function LivraisonPage() {
  const { business, user } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Order | null>(null);

  const [livreurs, setLivreurs] = useState<Livreur[]>([]);
  const [assigningOrder, setAssigningOrder] = useState<Order | null>(null);
  const [assignLivreurId, setAssignLivreurId] = useState('');
  const [sendWhatsApp, setSendWhatsApp] = useState(false);
  const [sending, setSending] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [waConfig, setWaConfig] = useState<any>(null);

  const fetchOrders = useCallback(async (silent = false) => {
    if (!business?.id) return;
    if (!silent) setLoading(true);
    try {
      const data = await getOrdersForDelivery(business.id);
      setOrders(data);
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [business?.id]);

  useEffect(() => {
    if (!business?.id) return;
    fetchOrders();
    getLivreurs(business.id).then(setLivreurs).catch(() => {});
    getWhatsAppConfig(business.id).then((cfg) => {
      setWaConfig(cfg);
      setSendWhatsApp(!!cfg?.is_active);
    }).catch(() => {});
  }, [fetchOrders, business?.id]);

  useEffect(() => {
    if (!business?.id) return;
    const channel = supabase
      .channel(`delivery:${business.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `business_id=eq.${business.id}` },
        () => { fetchOrders(true); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [business?.id, fetchOrders]);

  async function handleSelect(order: Order) {
    setSelected(order);
    if (order.delivery_status === 'pending') {
      try {
        await startOrderPicking(order.id);
        setOrders((prev) =>
          prev.map((o) => o.id === order.id ? { ...o, delivery_status: 'picking' } : o)
        );
      } catch { /* ignorer si déjà en cours */ }
    }
  }

  async function handleConfirm() {
    if (!selected || !user) return;
    try {
      await confirmOrderDelivery(selected.id, user.id);
      if (waConfig?.is_active && selected.customer_phone) {
        sendDeliveryConfirmationToClient(
          { phone_number_id: waConfig.phone_number_id, access_token: waConfig.access_token, business_id: business!.id },
          { id: selected.id, customer_name: selected.customer_name, customer_phone: selected.customer_phone, total: selected.total },
          waConfig.msg_delivery_confirmation ?? null,
        ).catch(() => {});
      }
      success(`Commande #${selected.id.slice(0, 8).toUpperCase()} livrée ✓`);
      setSelected(null);
      fetchOrders(true);
    } catch (err) {
      notifError(toUserError(err));
    }
  }

  function openAssign(order: Order) {
    setAssigningOrder(order);
    setAssignLivreurId((order as Order & { livreur_id?: string }).livreur_id ?? '');
    setSendWhatsApp(!!waConfig?.is_active);
  }

  async function handleAssign(forceNull = false) {
    if (!assigningOrder) return;
    setSending(true);
    try {
      const livreurId = forceNull ? null : (assignLivreurId || null);
      await assignLivreur(assigningOrder.id, livreurId);

      if (livreurId && sendWhatsApp && waConfig) {
        const livreur = livreurs.find((l) => l.id === livreurId);
        if (livreur) {
          const o = assigningOrder as Order & { delivery_address?: string; delivery_location?: unknown };
          await sendLocationToLivreur(
            { phone_number_id: waConfig.phone_number_id, access_token: waConfig.access_token },
            livreur,
            {
              id: assigningOrder.id,
              customer_name: assigningOrder.customer_name,
              customer_phone: assigningOrder.customer_phone,
              delivery_address: o.delivery_address,
              delivery_location: o.delivery_location,
              total: assigningOrder.total,
            },
          );
          success('Livreur assigné et notifié par WhatsApp');
        } else {
          success('Livreur assigné');
        }
      } else if (forceNull || !livreurId) {
        success('Livreur retiré');
      } else {
        success('Livreur assigné');
      }

      setOrders((prev) =>
        prev.map((o) => o.id === assigningOrder.id ? { ...o, livreur_id: livreurId } as any : o)
      );
      setAssigningOrder(null);
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setSending(false);
    }
  }

  const pending = orders.filter((o) => o.delivery_status === 'pending');
  const picking = orders.filter((o) => o.delivery_status === 'picking');

  return (
    <div className="flex h-full overflow-hidden">
      {/* -- Colonne gauche : liste des commandes -- */}
      <div className={`flex flex-col border-r border-surface-border transition-all ${
        selected ? 'w-80 shrink-0' : 'flex-1'
      }`}>
        {/* Header */}
        <div className="p-6 border-b border-surface-border">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-content-primary flex items-center gap-2">
                <Truck className="w-5 h-5 text-content-brand" />
                Livraisons
              </h1>
              <p className="text-xs text-content-secondary mt-0.5">Commandes en attente d'expédition — assignez un livreur et suivez l'état</p>
              <p className="text-xs text-content-muted">
                {orders.length} commande{orders.length !== 1 ? 's' : ''} à traiter
              </p>
            </div>
            <button onClick={() => fetchOrders(true)} className="btn-secondary p-2" title="Actualiser">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Liste */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="text-content-secondary text-center py-16 text-sm">Chargement…</div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-content-muted gap-3">
              <CheckCircle className="w-12 h-12 opacity-30" />
              <p className="font-medium">Tout est livré !</p>
              <p className="text-xs text-center">Aucune commande en attente de vérification.</p>
            </div>
          ) : (
            <>
              {[...picking, ...pending].map((order) => {
                const badge = DELIVERY_LABELS[order.delivery_status];
                const itemCount = order.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;
                const isSelected = selected?.id === order.id;
                type ExtOrder = Order & { delivery_type?: string; livreur_id?: string };
                const ext = order as ExtOrder;
                const isDelivery = ext.delivery_type === 'delivery';
                const hasLivreur = !!ext.livreur_id;

                return (
                  <div
                    key={order.id}
                    className={`w-full text-left rounded-xl border transition-all ${
                      isSelected
                        ? 'border-brand-500 bg-badge-brand'
                        : 'border-surface-border bg-surface-card hover:border-slate-600 hover:bg-surface-hover'
                    }`}
                  >
                    <button
                      onClick={() => handleSelect(order)}
                      className="w-full text-left p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-mono font-bold text-content-primary text-sm">
                            #{order.id.slice(0, 8).toUpperCase()}
                          </p>
                          {order.customer_name && (
                            <p className="text-xs text-content-secondary truncate">{order.customer_name}</p>
                          )}
                          {order.cashier && (
                            <p className="text-xs text-content-muted truncate">{order.cashier.full_name}</p>
                          )}
                        </div>
                        <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium border ${badge.color}`}>
                          {badge.label}
                        </span>
                      </div>

                      <div className="mt-2 space-y-1">
                        {order.items?.slice(0, 2).map((item) => (
                          <div key={item.id} className="flex items-center gap-1.5 text-xs text-content-secondary">
                            <Package className="w-3 h-3 shrink-0" />
                            <span className="truncate flex-1">{item.name}</span>
                            <span className="text-content-muted shrink-0">×{item.quantity}</span>
                          </div>
                        ))}
                        {(order.items?.length ?? 0) > 2 && (
                          <p className="text-xs text-content-muted">
                            +{order.items!.length - 2} article{order.items!.length - 2 > 1 ? 's' : ''}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between mt-3 pt-2 border-t border-surface-border">
                        <div className="flex items-center gap-1 text-xs text-content-muted">
                          <Clock className="w-3 h-3" />
                          {formatDistanceToNow(new Date(order.created_at), { addSuffix: true, locale: fr })}
                        </div>
                        <div className="text-right">
                          <span className="text-xs text-content-muted">{itemCount} article{itemCount > 1 ? 's' : ''}</span>
                          <span className="text-sm font-bold text-content-brand ml-2">
                            {formatCurrency(order.total, business?.currency)}
                          </span>
                        </div>
                      </div>
                    </button>

                    {isDelivery && livreurs.length > 0 && (
                      <div className="px-4 pb-3 flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); openAssign(order); }}
                          className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                            hasLivreur
                              ? 'border-status-success text-status-success bg-badge-success hover:bg-badge-success'
                              : 'border-surface-border text-content-secondary hover:text-content-primary hover:bg-surface-hover'
                          }`}
                        >
                          <UserCheck className="w-3 h-3" />
                          {hasLivreur
                            ? livreurs.find((l) => l.id === ext.livreur_id)?.name ?? 'Livreur assigné'
                            : 'Assigner livreur'
                          }
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* -- Panneau vérification -- */}
      {selected ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <OrderVerification
            order={selected}
            currency={business?.currency ?? 'XOF'}
            onConfirm={handleConfirm}
            onClose={() => setSelected(null)}
          />
        </div>
      ) : (
        <div className="flex-1 hidden md:flex flex-col items-center justify-center text-content-muted gap-3">
          <Truck className="w-16 h-16 opacity-20" />
          <p className="text-sm">Sélectionnez une commande pour démarrer la vérification</p>
        </div>
      )}

      {/* -- Modal assignation livreur -- */}
      {assigningOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-surface-card border border-surface-border rounded-2xl shadow-2xl w-full max-w-sm mx-4 flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
              <h3 className="font-semibold text-content-primary">Assigner un livreur</h3>
              <button
                onClick={() => setAssigningOrder(null)}
                className="p-1.5 rounded-lg text-content-secondary hover:text-content-primary hover:bg-surface-hover"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-content-secondary">
                Commande <span className="font-mono font-bold text-content-primary">#{assigningOrder.id.slice(0, 8).toUpperCase()}</span>
                {assigningOrder.customer_name && <> · {assigningOrder.customer_name}</>}
              </p>

              {(assigningOrder as any).livreur_id && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-badge-success border border-status-success">
                  <UserCheck className="w-4 h-4 text-status-success shrink-0" />
                  <span className="text-xs text-status-success">
                    Actuellement : {livreurs.find((l) => l.id === (assigningOrder as any).livreur_id)?.name ?? 'Livreur assigné'}
                  </span>
                </div>
              )}

              <div>
                <label className="label">Livreur</label>
                <select
                  className="input"
                  value={assignLivreurId}
                  onChange={(e) => setAssignLivreurId(e.target.value)}
                >
                  <option value="">— Aucun —</option>
                  {livreurs.map((l) => (
                    <option key={l.id} value={l.id}>{l.name} · {l.phone}</option>
                  ))}
                </select>
              </div>

              {waConfig?.is_active && assignLivreurId && (
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sendWhatsApp}
                    onChange={(e) => setSendWhatsApp(e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm text-content-primary">Envoyer la localisation par WhatsApp</span>
                </label>
              )}
            </div>
            <div className="px-5 pb-5 flex gap-2">
              {(assigningOrder as any).livreur_id && (
                <button
                  onClick={() => handleAssign(true)}
                  disabled={sending}
                  className="btn-secondary flex-1 h-9 text-sm"
                >
                  Retirer livreur
                </button>
              )}
              <button
                onClick={() => handleAssign()}
                disabled={sending || !assignLivreurId}
                className="btn-primary flex-1 h-9 text-sm"
              >
                {sending ? 'Envoi…' : 'Assigner'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
