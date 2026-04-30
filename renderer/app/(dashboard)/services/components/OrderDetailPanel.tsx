import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Printer, Edit2, Wrench, User, Search, Plus, Trash2, 
  Play, CheckCircle2, CreditCard, XCircle, Check, MessageCircle, 
  ChevronDown, ExternalLink, Bell 
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { useCan } from '@/hooks/usePermission';
import { cn, formatCurrency } from '@/lib/utils';
import { toUserError } from '@/lib/user-error';
import {
  updateServiceOrderStatus, cancelServiceOrder, updateServiceOrder,
  type ServiceOrder, type ServiceOrderStatus, type ServiceCatalogItem,
} from '@services/supabase/service-orders';
import { generateServiceOrderReceipt, printHtml } from '@/lib/invoice-templates';
import { shareServiceOrderViaWhatsApp } from '@/lib/share-service-order';
import { getStaff, type Staff } from '@services/supabase/staff';
import { useServiceOrderForm } from '../hooks/useServiceOrderForm';
import { SUBJECT_TYPES, subjectTypeCfg, fmtDateTime } from '../constants';
import { StatusBadge, OTNumber } from './StatusBadge';
import { PayModal } from './PayModal';
import { ConfirmModal } from '@/components/ui/Modal';

function SubjectTypePill({ type }: { type: string | null | undefined }) {
  const cfg = subjectTypeCfg(type);
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface-hover text-content-secondary border border-surface-border">
      {cfg.label}
    </span>
  );
}

export function OrderDetailPanel({ order, currency, catalog, businessId, onClose, onRefresh }: {
  order: ServiceOrder; currency: string; catalog: ServiceCatalogItem[];
  businessId: string; onClose: () => void; onRefresh: () => void;
}) {
  const { business, businesses, user } = useAuthStore();
  const can = useCan();
  const { success, error: notifError } = useNotificationStore();
  const [showPay, setShowPay] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showWaMenu, setShowWaMenu] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [staffList, setStaffList] = useState<Staff[]>([]);

  const {
    formData,
    updateField,
    handleRefChange,
    pickSubject,
    suggestions,
    showSugg,
    setShowSugg,
    handleClientSearch,
    pickClient,
    clientSugg,
    showClientSugg,
    setShowClientSugg,
    updateLine,
    removeLine,
    addLine,
    addFromCatalog,
    validate,
  } = useServiceOrderForm({
    subjectType: (order.subject_type as any) ?? 'autre',
    subjectRef: order.subject_ref ?? '',
    subjectInfo: order.subject_info ?? '',
    clientName: order.client_name ?? '',
    clientPhone: order.client_phone ?? '',
    notes: order.notes ?? '',
    assignedTo: order.assigned_to ?? '',
    assignedName: order.assigned_name ?? '',
    lines: (order.items ?? []).map((i, idx) => ({ 
      _id: idx + 1, 
      service_id: i.service_id, 
      name: i.name, 
      price: String(i.price), 
      quantity: i.quantity 
    }))
  }, businessId);

  const [editCatalogSearch, setEditCatalogSearch] = useState('');
  const [showEditCatalogDrop, setShowEditCatalogDrop] = useState(false);

  useEffect(() => {
    getStaff(businessId).then(s => setStaffList(s.filter(m => m.status === 'active'))).catch(() => {});
  }, [businessId]);

  const balance = order.total - order.paid_amount;
  const typeCfg = subjectTypeCfg(order.subject_type);
  const canEditOrder = can('edit_service_order');
  const canUpdateStatus = can('update_service_status');
  const canCollectPayment = can('collect_service_payment');
  const canShareOrder = can('share_service_order');
  const canCancelOrder = can('cancel_service_order');
  const activeRole = businesses.find(m => m.business.id === business?.id)?.role ?? user?.role;
  const canEditThisOrder = canEditOrder && order.status !== 'annule' && (order.status !== 'paye' || activeRole === 'owner');

  function deny() {
    notifError('Permission insuffisante');
  }

  async function transition(newStatus: ServiceOrderStatus) {
    if (!canUpdateStatus) { deny(); return; }
    setBusy(true);
    try {
      await updateServiceOrderStatus(order.id, newStatus, { userId: user?.id, userName: user?.full_name });
      fetch('/api/client-push/notify', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceOrderId: order.id,
          status:         newStatus,
          orderRef:       `OT-${String(order.order_number).padStart(4, '0')}`,
          businessName:   business?.name ?? '',
        }),
      }).catch(() => {});
      onRefresh(); onClose();
    }
    catch (e: any) { notifError(toUserError(e)); }
    finally { setBusy(false); }
  }

  async function doCancel() {
    if (!canCancelOrder) { deny(); return; }
    setBusy(true);
    try { await cancelServiceOrder(order.id, { userId: user?.id, userName: user?.full_name }); onRefresh(); onClose(); }
    catch (e: any) { notifError(toUserError(e)); }
    finally { setBusy(false); }
  }

  async function saveEdit() {
    if (!canEditThisOrder) { deny(); return; }
    const { isValid, errors, validLines } = validate();
    if (!isValid) {
        if (errors.lines) notifError(errors.lines);
        return;
    }

    setBusy(true);
    try {
      await updateServiceOrder(order.id, {
        subjectRef:   formData.subjectRef,
        subjectType:  formData.subjectType,
        subjectInfo:  formData.subjectInfo,
        clientName:   formData.clientName,
        clientPhone:  formData.clientPhone,
        assignedTo:   formData.assignedTo || null,
        assignedName: staffList.find(s => s.id === formData.assignedTo)?.name || null,
        notes:        formData.notes,
        items: validLines.map(l => ({
          service_id: l.service_id,
          name:       l.name.trim(),
          price:      parseFloat(l.price),
          quantity:   l.quantity,
        })),
      }, { userId: user?.id, userName: user?.full_name, role: activeRole });
      setEditing(false);
      onRefresh(); onClose();
    } catch (e: any) { notifError(toUserError(e)); }
    finally { setBusy(false); }
  }

  async function handleWhatsApp(type: 'receipt' | 'tracking' | 'status_update') {
    if (!canShareOrder) { deny(); return; }
    if (!business || !user) return;
    setShowWaMenu(false);
    try {
      setBusy(true);
      const res = await shareServiceOrderViaWhatsApp(order, business as any, user.id, {
        type,
        includeTracking: type === 'tracking' || type === 'status_update',
      });
      if (res.success) success('Message WhatsApp envoyé');
      else throw new Error(res.error);
    } catch (e: any) { notifError(toUserError(e)); }
    finally { setBusy(false); }
  }

  function handlePrint() {
    if (!canShareOrder) { deny(); return; }
    if (!business) return;
    printHtml(generateServiceOrderReceipt({
      id: order.id, order_number: order.order_number, created_at: order.created_at,
      started_at: order.started_at, finished_at: order.finished_at, paid_at: order.paid_at,
      subject_ref: order.subject_ref,
      subject_info: order.subject_info ?? undefined,
      client_name: order.client_name, client_phone: order.client_phone,
      assigned_name: order.assigned_name,
      status: order.status, notes: order.notes,
      items: (order.items ?? []).map(i => ({ name: i.name, price: i.price, quantity: i.quantity, total: i.total })),
      total: order.total, paid_amount: order.paid_amount, payment_method: order.payment_method,
    }, business as any));
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-lg bg-surface-card border-l border-surface-border shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-surface-border shrink-0">
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-hover text-content-secondary"><X className="w-5 h-5" /></button>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <OTNumber n={order.order_number} />
              <StatusBadge status={order.status} />
              {order.subject_type && <SubjectTypePill type={order.subject_type} />}
            </div>
            {order.subject_ref && <p className="text-sm font-mono font-bold text-content-primary mt-0.5">{order.subject_ref}</p>}
          </div>
          <div className="flex items-center gap-2">
            {canShareOrder && (
              <button onClick={handlePrint} className="p-2 rounded-xl hover:bg-surface-hover text-content-secondary" title="Imprimer"><Printer className="w-4 h-4" /></button>
            )}
            {canEditThisOrder && (
              <button onClick={() => setEditing(v => !v)} className={cn('p-2 rounded-xl hover:bg-surface-hover', editing ? 'text-brand-400 bg-brand-500/10' : 'text-content-secondary')}><Edit2 className="w-4 h-4" /></button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Subject */}
          {(order.subject_ref || editing) && (
            <div className="rounded-xl bg-surface-hover p-4 space-y-3">
              <p className="text-xs text-content-secondary font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5" />{order.subject_type ? typeCfg.label : 'Sujet'}
              </p>
              {editing ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2 pb-2 border-b border-surface-border">
                    {SUBJECT_TYPES.map(t => (
                      <button key={t.value} onClick={() => updateField('subjectType', t.value)}
                        className={cn('px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors', formData.subjectType === t.value
                          ? 'bg-brand-500/20 border-brand-500/50 text-content-brand'
                          : 'border-surface-border text-content-secondary hover:bg-surface-hover')}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <div>
                    <label className="text-[10px] text-content-secondary">{subjectTypeCfg(formData.subjectType).refLabel}</label>
                    <input value={formData.subjectRef} onChange={e => updateField('subjectRef', e.target.value)} className="w-full px-2 py-1.5 rounded-lg bg-surface-input border border-surface-border text-content-primary text-sm mt-0.5" />
                  </div>
                  <div>
                    <label className="text-[10px] text-content-secondary">{subjectTypeCfg(formData.subjectType).infoLabel}</label>
                    <input value={formData.subjectInfo} onChange={e => updateField('subjectInfo', e.target.value)} className="w-full px-2 py-1.5 rounded-lg bg-surface-input border border-surface-border text-content-primary text-sm mt-0.5" />
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-xl font-bold text-content-primary font-mono">{order.subject_ref}</p>
                  {order.subject_info && <p className="text-sm text-content-secondary">{order.subject_info}</p>}
                </>
              )}
            </div>
          )}

          {/* Client */}
          {(order.client_name || editing) && (
            <div className="rounded-xl bg-surface-hover p-4 space-y-3">
              <p className="text-xs text-content-secondary font-semibold uppercase tracking-wider flex items-center gap-1.5"><User className="w-3.5 h-3.5" />Client</p>
              {editing ? (
                <div className="grid grid-cols-2 gap-2 relative">
                  {showClientSugg && clientSugg.length > 0 && (
                    <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-surface-card border border-surface-border rounded-xl shadow-xl overflow-hidden col-span-2">
                      {clientSugg.map(c => (
                        <button key={c.id} onMouseDown={() => pickClient(c)}
                          className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-hover text-left transition-colors border-b border-surface-border last:border-0">
                          <div className="w-7 h-7 rounded-full bg-brand-500/10 flex items-center justify-center shrink-0 text-xs font-bold text-content-brand">
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-content-primary truncate">{c.name}</p>
                            {c.phone && <p className="text-xs text-content-muted">{c.phone}</p>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  <div><label className="text-[10px] text-content-secondary">Nom</label>
                    <input value={formData.clientName}
                      onChange={e => handleClientSearch(e.target.value, 'clientName')}
                      onBlur={() => setTimeout(() => setShowClientSugg(false), 150)}
                      className="w-full px-2 py-1.5 rounded-lg bg-surface-input border border-surface-border text-content-primary text-sm mt-0.5" /></div>
                  <div><label className="text-[10px] text-content-secondary">Téléphone</label>
                    <input value={formData.clientPhone}
                      onChange={e => handleClientSearch(e.target.value, 'clientPhone')}
                      onBlur={() => setTimeout(() => setShowClientSugg(false), 150)}
                      className="w-full px-2 py-1.5 rounded-lg bg-surface-input border border-surface-border text-content-primary text-sm mt-0.5" /></div>
                </div>
              ) : (
                <>
                  <p className="font-semibold text-content-primary">{order.client_name}</p>
                  {order.client_phone && <p className="text-sm text-content-secondary">{order.client_phone}</p>}
                </>
              )}
              {/* Assignation dans le mode édition */}
              {editing && staffList.length > 0 && (
                <div className="mt-2">
                  <label className="text-[10px] text-content-secondary">Technicien assigné</label>
                  <select value={formData.assignedTo} onChange={e => updateField('assignedTo', e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg bg-surface-input border border-surface-border text-content-primary text-sm mt-0.5">
                    <option value="">— Non assigné —</option>
                    {staffList.map(s => (
                      <option key={s.id} value={s.id}>{s.name}{s.position ? ` · ${s.position}` : ''}</option>
                    ))}
                  </select>
                </div>
              )}
              {/* Affichage assigné (lecture) */}
              {!editing && order.assigned_name && (
                <div className="flex items-center gap-1.5 mt-1">
                  <Wrench className="w-3 h-3 text-content-secondary" />
                  <p className="text-sm text-content-secondary">{order.assigned_name}</p>
                </div>
              )}
            </div>
          )}

          {/* Assignation quand pas de client */}
          {!order.client_name && !editing && order.assigned_name && (
            <div className="rounded-xl bg-surface-hover p-3 flex items-center gap-2">
              <Wrench className="w-3.5 h-3.5 text-content-secondary" />
              <span className="text-sm text-content-secondary">Assigné à <strong className="text-content-primary">{order.assigned_name}</strong></span>
            </div>
          )}
          {!order.client_name && editing && staffList.length > 0 && (
            <div className="rounded-xl bg-surface-hover p-3 space-y-1">
              <label className="text-[10px] text-content-secondary uppercase tracking-wider font-semibold flex items-center gap-1"><Wrench className="w-3 h-3" />Technicien assigné</label>
              <select value={formData.assignedTo} onChange={e => updateField('assignedTo', e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg bg-surface-input border border-surface-border text-content-primary text-sm">
                <option value="">— Non assigné —</option>
                {staffList.map(s => (
                  <option key={s.id} value={s.id}>{s.name}{s.position ? ` · ${s.position}` : ''}</option>
                ))}
              </select>
            </div>
          )}

          {/* Items */}
          <div className="rounded-xl border border-surface-border overflow-hidden">
            <p className="text-xs text-content-secondary font-semibold uppercase tracking-wider px-4 py-3 bg-surface-hover flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5" />Prestations
            </p>
            {editing ? (
              <div className="p-3 space-y-2">
                {catalog.length > 0 && (
                  <div className="relative pb-2 border-b border-surface-border">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-muted pointer-events-none" />
                      <input
                        value={editCatalogSearch}
                        onChange={e => { setEditCatalogSearch(e.target.value); setShowEditCatalogDrop(true); }}
                        onFocus={() => setShowEditCatalogDrop(true)}
                        onBlur={() => setTimeout(() => setShowEditCatalogDrop(false), 150)}
                        placeholder="Rechercher une prestation du catalogue…"
                        className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-input border border-surface-border text-content-primary placeholder-content-muted text-sm"
                      />
                    </div>
                    {showEditCatalogDrop && editCatalogSearch.length >= 1 && (
                      <div className="absolute left-0 right-0 z-40 mt-1 bg-surface-card border border-surface-border rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                        {catalog.filter(i => i.name.toLowerCase().includes(editCatalogSearch.toLowerCase())).slice(0, 20).map(item => (
                          <button key={item.id}
                            onMouseDown={() => { addFromCatalog(item); setEditCatalogSearch(''); setShowEditCatalogDrop(false); }}
                            className="w-full flex items-center justify-between px-4 py-2 hover:bg-surface-hover text-left border-b border-surface-border last:border-0 transition-colors">
                            <div>
                              <p className="text-sm font-medium text-content-primary">{item.name}</p>
                              {item.service_category?.name && <p className="text-[10px] text-content-muted">{item.service_category.name}</p>}
                            </div>
                            <span className="text-sm font-bold text-content-brand ml-3">{formatCurrency(item.price)}</span>
                          </button>
                        ))}
                        {catalog.filter(i => i.name.toLowerCase().includes(editCatalogSearch.toLowerCase())).length === 0 && (
                          <p className="px-4 py-3 text-sm text-content-muted italic">Aucune prestation trouvée</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {formData.lines.map(line => (
                  <div key={line._id} className="flex gap-2 items-center">
                    <input value={line.name} onChange={e => updateLine(line._id, 'name', e.target.value)} placeholder="Prestation"
                      className="flex-1 px-2 py-1.5 rounded-lg bg-surface-input border border-surface-border text-content-primary text-sm" />
                    <input value={line.price} onChange={e => updateLine(line._id, 'price', e.target.value)} type="number" min={0} placeholder="Prix"
                      className="w-20 px-2 py-1.5 rounded-lg bg-surface-input border border-surface-border text-content-primary text-sm" />
                    <input value={line.quantity} onChange={e => updateLine(line._id, 'quantity', parseInt(e.target.value) || 1)} type="number" min={1}
                      className="w-12 px-2 py-1.5 rounded-lg bg-surface-input border border-surface-border text-content-primary text-sm text-center" />
                    <button onClick={() => removeLine(line._id)}
                      className="p-1.5 rounded-lg hover:bg-red-500/20 text-content-secondary hover:text-status-error"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                <button onClick={() => addLine()} className="text-xs text-content-brand hover:text-brand-400 flex items-center gap-1 font-medium mt-1">
                  <Plus className="w-3.5 h-3.5" />Ajouter
                </button>
              </div>
            ) : (
              <div className="divide-y divide-surface-border">
                {(order.items ?? []).map(item => (
                  <div key={item.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm text-content-primary font-medium">{item.name}</p>
                      {item.quantity > 1 && <p className="text-xs text-content-secondary">{item.quantity} × {formatCurrency(item.price, currency)}</p>}
                    </div>
                    <span className="text-sm font-semibold text-content-primary">{formatCurrency(item.total, currency)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          {editing ? (
            <div>
              <label className="text-xs text-content-secondary font-medium mb-1 block">Notes</label>
              <textarea value={formData.notes} onChange={e => updateField('notes', e.target.value)} rows={2}
                className="w-full px-3 py-2 rounded-xl bg-surface-input border border-surface-border text-content-primary text-sm resize-none" />
            </div>
          ) : order.notes && (
            <div className="rounded-xl bg-surface-hover p-4">
              <p className="text-xs text-content-secondary font-semibold uppercase tracking-wider mb-1">Notes</p>
              <p className="text-sm text-content-secondary italic">{order.notes}</p>
            </div>
          )}

          {/* Timeline */}
          {!editing && (
            <div className="rounded-xl border border-surface-border overflow-hidden">
              <p className="text-[10px] font-black uppercase tracking-widest text-content-secondary px-4 py-2.5 bg-surface-hover border-b border-surface-border">
                Chronologie
              </p>
              <div className="divide-y divide-surface-border">
                {[
                  { label: 'Créé',     ts: order.created_at,  dot: 'bg-content-muted'     },
                  { label: 'Démarré',  ts: order.started_at,  dot: 'bg-status-info'        },
                  { label: 'Terminé',  ts: order.finished_at, dot: 'bg-status-success'     },
                  { label: 'Payé',     ts: order.paid_at,     dot: 'bg-status-success'     },
                ].map(({ label, ts, dot }) => (
                  <div key={label} className={cn('flex items-center justify-between px-4 py-2.5', !ts && 'opacity-35')}>
                    <div className="flex items-center gap-2">
                      <span className={cn('w-2 h-2 rounded-full shrink-0', ts ? dot : 'bg-surface-border')} />
                      <span className="text-xs font-semibold text-content-secondary">{label}</span>
                    </div>
                    <span className="text-xs font-mono text-content-primary">
                      {ts ? fmtDateTime(ts) : '—'}
                    </span>
                  </div>
                ))}
                {/* Durée totale si démarré et terminé */}
                {order.started_at && order.finished_at && (() => {
                  const mins = Math.round((new Date(order.finished_at).getTime() - new Date(order.started_at).getTime()) / 60000);
                  const h = Math.floor(mins / 60), m = mins % 60;
                  return (
                    <div className="flex items-center justify-between px-4 py-2 bg-surface-hover">
                      <span className="text-[10px] font-black text-content-secondary uppercase tracking-widest">Durée intervention</span>
                      <span className="text-xs font-bold text-content-brand">{h > 0 ? `${h}h ` : ''}{m}min</span>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Totals */}
          <div className="rounded-xl border border-surface-border overflow-hidden">
            <div className="flex justify-between px-4 py-3">
              <span className="text-content-secondary text-sm">Total</span>
              <span className="font-bold text-content-primary">{formatCurrency(order.total, currency)}</span>
            </div>
            {order.paid_amount > 0 && (
              <div className="flex justify-between px-4 py-3 border-t border-surface-border">
                <span className="text-status-success text-sm">Payé</span>
                <span className="font-semibold text-status-success">-{formatCurrency(order.paid_amount, currency)}</span>
              </div>
            )}
            {balance > 0 && (
              <div className="flex justify-between px-4 py-3 border-t border-surface-border bg-badge-error">
                <span className="text-status-error text-sm font-semibold">Reste dû</span>
                <span className="font-bold text-status-error">{formatCurrency(balance, currency)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-surface-border shrink-0 space-y-2">
          {editing ? (
            <div className="flex gap-3">
              <button onClick={() => setEditing(false)} className="flex-1 py-2.5 rounded-xl border border-surface-border text-content-secondary text-sm">Annuler</button>
              <button onClick={saveEdit} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-sm disabled:opacity-40">
                {busy ? 'Sauvegarde…' : 'Enregistrer'}
              </button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                {canUpdateStatus && order.status === 'attente' && (
                  <button onClick={() => transition('en_cours')} disabled={busy}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-status-info hover:opacity-90 text-white text-sm font-semibold disabled:opacity-40">
                    <Play className="w-4 h-4" />Démarrer
                  </button>
                )}
                {canUpdateStatus && order.status === 'en_cours' && (
                  <button onClick={() => transition('termine')} disabled={busy}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-status-success hover:opacity-90 text-white text-sm font-semibold disabled:opacity-40">
                    <CheckCircle2 className="w-4 h-4" />Terminer
                  </button>
                )}
                {canCollectPayment && order.status === 'termine' && (
                  <button onClick={() => setShowPay(true)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-status-success hover:opacity-90 text-white text-sm font-bold">
                    <CreditCard className="w-4 h-4" />Encaisser
                  </button>
                )}
                {canCancelOrder && order.status !== 'paye' && order.status !== 'annule' && (
                  <button onClick={() => setShowCancelConfirm(true)} disabled={busy}
                    className="p-2.5 rounded-xl border border-surface-border text-content-secondary hover:bg-red-500/20 hover:text-status-error hover:border-red-500/30">
                    <XCircle className="w-4 h-4" />
                  </button>
                )}
              </div>
              {order.status === 'paye' && (
                <div className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-badge-success text-status-success font-bold text-sm border border-status-success/30 mb-2">
                  <Check className="w-4 h-4" />Soldé — {formatCurrency(order.paid_amount, currency)}
                </div>
              )}

              {/* Barre de partage / actions secondaires */}
              {canShareOrder && (
              <div className="flex gap-2">
                <button onClick={handlePrint} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border border-surface-border text-content-secondary text-xs font-semibold hover:bg-surface-hover">
                  <Printer className="w-3.5 h-3.5" />Imprimer
                </button>

                {/* WhatsApp dropdown — PDF ou Suivi */}
                <div className="relative flex-1">
                  <button
                    onClick={() => setShowWaMenu(v => !v)}
                    disabled={busy}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-status-success/30 text-status-success text-xs font-semibold hover:bg-badge-success"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    WhatsApp
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  {showWaMenu && (
                    <div className="absolute bottom-full mb-1 left-0 right-0 bg-surface-card border border-surface-border rounded-xl shadow-lg overflow-hidden z-20">
                      <button
                        onClick={() => handleWhatsApp('receipt')}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-content-primary hover:bg-surface-hover"
                      >
                        <Printer className="w-3.5 h-3.5 text-content-brand" />Envoyer le reçu PDF
                      </button>
                      <div className="border-t border-surface-border" />
                      <button
                        onClick={() => handleWhatsApp('tracking')}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-content-primary hover:bg-surface-hover"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-content-brand" />Envoyer le lien de suivi
                      </button>
                    </div>
                  )}
                </div>

                {order.status !== 'attente' && order.status !== 'paye' && (
                  <button onClick={() => handleWhatsApp('status_update')} disabled={busy}
                    className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border border-status-info/30 text-status-info text-xs font-semibold hover:bg-badge-info">
                    <Bell className="w-3.5 h-3.5" />Notifier
                  </button>
                )}
              </div>
              )}
            </>
          )}
        </div>
      </div>

      {showPay && canCollectPayment && (
        <PayModal order={order} currency={currency} onClose={() => setShowPay(false)} onPaid={() => { setShowPay(false); onRefresh(); onClose(); }} />
      )}

      {showCancelConfirm && (
        <ConfirmModal
          title="Annuler l'ordre de travail"
          message="Êtes-vous sûr de vouloir annuler cet ordre de travail ? Cette action est irréversible."
          confirmLabel="Oui, annuler"
          cancelLabel="Non, garder"
          type="danger"
          onConfirm={() => { setShowCancelConfirm(false); doCancel(); }}
          onCancel={() => setShowCancelConfirm(false)}
        />
      )}
    </>
  );
}
