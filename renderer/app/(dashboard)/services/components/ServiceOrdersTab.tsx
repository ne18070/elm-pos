import React from 'react';
import { 
  Search, X, RefreshCw, Wrench, Plus, Play, 
  CheckCircle2, CreditCard, Printer, User, 
  ChevronLeft, ChevronRight 
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { useCan } from '@/hooks/usePermission';
import { useCashSessionStore } from '@/store/cashSession';
import { toUserError } from '@/lib/user-error';
import { 
  updateServiceOrderStatus, 
  type ServiceOrder, 
  type ServiceOrderStatus 
} from '@services/supabase/service-orders';
import { useServiceOrders } from '../hooks/useServiceOrders';
import { StatusBadge, OTNumber } from './StatusBadge';
import { subjectTypeCfg } from '../constants';

function SubjectTypePill({ type }: { type: string | null | undefined }) {
  const cfg = subjectTypeCfg(type);
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface-hover text-content-secondary border border-surface-border">
      {cfg.label}
    </span>
  );
}

const STATUS_TABS = [
  { key: 'all',      label: 'Tous'     },
  { key: 'attente',  label: 'Attente'  },
  { key: 'en_cours', label: 'En cours' },
  { key: 'termine',  label: 'Terminé'  },
  { key: 'paye',     label: 'Payé'     },
  { key: 'annule',   label: 'Annulé'   },
] as const;

export function ServiceOrdersTab({
  businessId,
  currency,
  onSelectOrder,
  onNewOrder,
  onPrintOrder,
  refreshTrigger = 0,
  initialStatus,
}: {
  businessId: string;
  currency: string;
  onSelectOrder: (order: ServiceOrder) => void;
  onNewOrder: () => void;
  onPrintOrder: (order: ServiceOrder, e: React.MouseEvent) => void;
  refreshTrigger?: number;
  initialStatus?: ServiceOrderStatus | 'all';
}) {
  const { user, business } = useAuthStore();
  const { session: cashSession } = useCashSessionStore();
  const can = useCan();
  const { success, error: notifError } = useNotificationStore();

  const canCreateOrder = can('create_service_order');
  const canUpdateStatus = can('update_service_status');
  const canCollectPayment = can('collect_service_payment');
  const canShareOrder = can('share_service_order');
  const [statusFilter, setStatusFilter] = React.useState<ServiceOrderStatus | 'all'>(initialStatus ?? 'all');
  React.useEffect(() => { setStatusFilter(initialStatus ?? 'all'); }, [initialStatus]);
  const [search, setSearch] = React.useState('');
  const [dateFilter, setDateFilter] = React.useState('');
  const [page, setPage] = React.useState(1);
  const pageSize = 25;

  const {
    orders,
    totalCount,
    counts,
    loading,
    refresh,
    setOrders,
  } = useServiceOrders({
    businessId,
    statusFilter,
    search,
    dateFilter,
    page,
    pageSize,
    refreshTrigger,
  });

  React.useEffect(() => { setPage(1); }, [businessId, dateFilter, statusFilter, search]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  async function quickTransition(id: string, status: ServiceOrderStatus, e: React.MouseEvent) {
    e.stopPropagation();
    if (!canUpdateStatus) {
      notifError('Permission insuffisante');
      return;
    }
    try {
      await updateServiceOrderStatus(id, status, { userId: user?.id, userName: user?.full_name });
      const order = orders.find(o => o.id === id);
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
      success('Statut mis à jour');
      // Push notification client (fire-and-forget)
      if (order) {
        fetch('/api/client-push/notify', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serviceOrderId: id,
            status,
            orderRef:     `OT-${String(order.order_number).padStart(4, '0')}`,
            businessName: business?.name ?? '',
          }),
        }).catch(() => {});
      }
    } catch (err: any) { notifError(toUserError(err)); }
  }

  return (
    <>
      {/* Workflow hint */}
      <div className="px-4 pt-3 pb-0 bg-surface-card shrink-0 md:px-6">
        <p className="text-[11px] text-content-secondary flex items-center gap-1 flex-wrap">
          <Wrench className="w-3 h-3 flex-shrink-0" />
          Flux&nbsp;:
          <span className="text-status-warning font-semibold">En attente</span>
          <span>→</span>
          <span className="text-status-info font-semibold">En cours</span>
          <span>→</span>
          <span className="text-status-success font-semibold">Terminé</span>
          <span>→</span>
          <span className="text-status-success font-semibold">Payé</span>
          <span className="opacity-50 ml-1">· Cliquez un OT pour modifier, encaisser ou imprimer</span>
        </p>
      </div>
      {/* Filters */}
      <div className="px-4 py-3 bg-surface-card border-b border-surface-border shrink-0 space-y-3 md:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-secondary" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher référence, client, prestation…"
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-surface-input border border-surface-border text-content-primary text-sm" />
          </div>
          <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-surface-input border border-surface-border text-content-primary text-sm sm:w-auto" />
          {dateFilter && (
            <button onClick={() => setDateFilter('')} className="p-2 rounded-xl hover:bg-surface-hover text-content-secondary"><X className="w-4 h-4" /></button>
          )}
          <button onClick={refresh} className="p-2 rounded-xl hover:bg-surface-hover text-content-secondary"><RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} /></button>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {STATUS_TABS.map(({ key, label }) => (
            <button key={key} onClick={() => setStatusFilter(key as any)}
              className={cn('flex-none flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors', statusFilter === key
                ? 'bg-brand-500 text-white'
                : 'bg-surface-hover text-content-secondary hover:text-content-primary')}>
              {label}
              {(counts[key] ?? 0) > 0 && (
                <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full', statusFilter === key ? 'bg-white/20 text-white' : 'bg-surface-border')}>
                  {counts[key]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Orders grid */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {loading && orders.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-content-secondary">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />Chargement…
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-content-secondary gap-3">
            <Wrench className="w-12 h-12 opacity-20" />
            <p className="text-sm">Aucun ordre de travail</p>
            {canCreateOrder && (
            <button onClick={onNewOrder} className="text-xs text-content-brand hover:underline flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" />Créer un OT
            </button>
            )}
          </div>
        ) : (
          <>
          <div className="space-y-3 md:hidden">
            {orders.map(order => {
              const balance = order.total - order.paid_amount;
              return (
                <div key={order.id} onClick={() => onSelectOrder(order)}
                  className="bg-surface-card rounded-2xl border border-surface-border hover:border-brand-500/30 hover:shadow-lg transition-all cursor-pointer overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <OTNumber n={order.order_number} />
                      <StatusBadge status={order.status} />
                    </div>

                    {order.subject_ref && (
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {order.subject_type && <SubjectTypePill type={order.subject_type} />}
                        <p className="text-base font-mono font-bold text-content-primary">{order.subject_ref}</p>
                      </div>
                    )}
                    {order.subject_info && <p className="text-xs text-content-secondary mb-1">{order.subject_info}</p>}
                    {order.client_name && (
                      <p className="text-sm text-content-secondary flex items-center gap-1 mb-1"><User className="w-3 h-3" />{order.client_name}</p>
                    )}

                    <div className="mt-2 space-y-0.5">
                      {(order.items ?? []).slice(0, 3).map(item => (
                        <p key={item.id} className="text-xs text-content-secondary truncate">· {item.name}{item.quantity > 1 ? ` ×${item.quantity}` : ''}</p>
                      ))}
                      {(order.items ?? []).length > 3 && <p className="text-xs text-content-secondary">+{(order.items ?? []).length - 3} autres…</p>}
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <div>
                        <span className="text-base font-bold text-content-primary">{formatCurrency(order.total, currency)}</span>
                        {balance > 0 && balance < order.total && (
                          <span className="ml-2 text-xs text-status-error">reste {formatCurrency(balance, currency)}</span>
                        )}
                      </div>
                      <span className="text-xs text-content-secondary">{new Date(order.created_at).toLocaleDateString('fr-FR')}</span>
                    </div>
                  </div>

                  {/* Quick actions */}
                  <div className="flex border-t border-surface-border divide-x divide-surface-border">
                    {canUpdateStatus && order.status === 'attente' && (
                      <button onClick={e => quickTransition(order.id, 'en_cours', e)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-status-info hover:bg-badge-info transition-colors">
                        <Play className="w-3.5 h-3.5" />Démarrer
                      </button>
                    )}
                    {canUpdateStatus && order.status === 'en_cours' && (
                      <button onClick={e => quickTransition(order.id, 'termine', e)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-status-success hover:bg-badge-success transition-colors">
                        <CheckCircle2 className="w-3.5 h-3.5" />Terminer
                      </button>
                    )}
                    {canCollectPayment && order.status === 'termine' && (
                      <button 
                        onClick={e => { e.stopPropagation(); onSelectOrder(order); }}
                        disabled={!cashSession}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-status-success hover:bg-badge-success transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        title={!cashSession ? 'Session de caisse fermée' : undefined}
                      >
                        <CreditCard className="w-3.5 h-3.5" />Encaisser
                      </button>
                    )}
                    {(order.status === 'paye' || order.status === 'annule') && (
                      <div className="flex-1" />
                    )}
                    {canShareOrder && (
                    <button onClick={e => onPrintOrder(order, e)}
                      className="px-4 flex items-center justify-center text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors">
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden md:block overflow-hidden rounded-lg border border-surface-border bg-surface-card">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-surface-border text-sm">
                <thead className="bg-surface-hover text-xs font-semibold uppercase text-content-secondary">
                  <tr>
                    <th className="px-4 py-3 text-left">OT</th>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Client</th>
                    <th className="px-4 py-3 text-left">Reference</th>
                    <th className="px-4 py-3 text-left">Prestations</th>
                    <th className="px-4 py-3 text-left">Statut</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {orders.map(order => {
                    const balance = order.total - order.paid_amount;
                    const items = order.items ?? [];
                    return (
                      <tr key={order.id} onClick={() => onSelectOrder(order)} className="cursor-pointer hover:bg-surface-hover/70">
                        <td className="whitespace-nowrap px-4 py-3"><OTNumber n={order.order_number} /></td>
                        <td className="whitespace-nowrap px-4 py-3 text-content-secondary">{new Date(order.created_at).toLocaleDateString('fr-FR')}</td>
                        <td className="px-4 py-3">
                          <div className="max-w-[180px] truncate font-medium text-content-primary">{order.client_name || '-'}</div>
                          {order.client_phone && <div className="text-xs text-content-secondary">{order.client_phone}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {order.subject_type && <SubjectTypePill type={order.subject_type} />}
                            <span className="max-w-[160px] truncate font-mono font-semibold text-content-primary">{order.subject_ref || '-'}</span>
                          </div>
                          {order.subject_info && <div className="mt-0.5 max-w-[220px] truncate text-xs text-content-secondary">{order.subject_info}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="max-w-[260px] truncate text-content-primary">
                            {items.length ? items.slice(0, 2).map(i => i.name).join(', ') : '-'}
                            {items.length > 2 ? ` +${items.length - 2}` : ''}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3"><StatusBadge status={order.status} /></td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <div className="font-bold text-content-primary">{formatCurrency(order.total, currency)}</div>
                          {balance > 0 && balance < order.total && <div className="text-xs text-status-error">reste {formatCurrency(balance, currency)}</div>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {canUpdateStatus && order.status === 'attente' && (
                              <button onClick={e => quickTransition(order.id, 'en_cours', e)}
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-status-info hover:bg-badge-info">
                                <Play className="h-3.5 w-3.5" />Demarrer
                              </button>
                            )}
                            {canUpdateStatus && order.status === 'en_cours' && (
                              <button onClick={e => quickTransition(order.id, 'termine', e)}
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-status-success hover:bg-badge-success">
                                <CheckCircle2 className="h-3.5 w-3.5" />Terminer
                              </button>
                            )}
                            {canCollectPayment && order.status === 'termine' && (
                              <button 
                                onClick={e => { e.stopPropagation(); onSelectOrder(order); }}
                                disabled={!cashSession}
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-status-success hover:bg-badge-success disabled:opacity-40 disabled:cursor-not-allowed"
                                title={!cashSession ? 'Session de caisse fermée' : undefined}
                              >
                                <CreditCard className="h-3.5 w-3.5" />Encaisser
                              </button>
                            )}
                            {canShareOrder && (
                              <button onClick={e => onPrintOrder(order, e)}
                                className="rounded-lg p-2 text-content-secondary hover:bg-surface-hover hover:text-content-primary"
                                title="Imprimer">
                                <Printer className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col gap-3 text-sm text-content-secondary sm:flex-row sm:items-center sm:justify-between mt-4">
            <span>
              {totalCount === 0 ? '0 resultat' : `${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, totalCount)} sur ${totalCount}`}
            </span>
            <div className="flex items-center justify-between gap-2 sm:justify-end">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="inline-flex items-center gap-1 rounded-lg border border-surface-border px-3 py-2 font-medium disabled:opacity-40 hover:bg-surface-hover transition-colors">
                <ChevronLeft className="h-4 w-4" />Precedent
              </button>
              <span className="min-w-[100px] text-center">Page {page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="inline-flex items-center gap-1 rounded-lg border border-surface-border px-3 py-2 font-medium disabled:opacity-40 hover:bg-surface-hover transition-colors">
                Suivant<ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          </>
        )}
      </div>
    </>
  );
}
