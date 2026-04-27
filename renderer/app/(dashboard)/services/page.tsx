'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Plus, Search, Printer, X, Check, Wrench,
  Clock, CheckCircle2, XCircle, Edit2, Trash2, Play,
  Square, CreditCard, Package2, ChevronDown, ChevronUp,
  RefreshCw, User, Phone, History, MessageCircle, Bell,
  ExternalLink, Copy, Share2, LayoutGrid
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { cn, formatCurrency } from '@/lib/utils';
import {
  getServiceOrders, getServiceCatalog, getAllServiceCatalog, getSubjects,
  createServiceOrder, updateServiceOrderStatus, payServiceOrder,
  updateServiceOrder, cancelServiceOrder,
  getServiceCategories, upsertServiceCategory, deleteServiceCategory,
  upsertServiceCatalogItem, toggleServiceCatalogItem, deleteServiceCatalogItem,
  searchSubjects, getSubjectHistory,
  type ServiceOrder, type ServiceOrderStatus, type ServiceCatalogItem,
  type ServiceSubject, type ServiceCategory, type SubjectType,
} from '@services/supabase/service-orders';
import { generateServiceOrderReceipt, printHtml } from '@/lib/invoice-templates';
import { shareServiceOrderViaWhatsApp } from '@/lib/share-service-order';
import { buildPublicBusinessRef } from '@services/supabase/public-business-ref';

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_CFG: Record<ServiceOrderStatus, { label: string; color: string; dot: string }> = {
  attente:  { label: 'En attente', color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30', dot: 'bg-yellow-400'  },
  en_cours: { label: 'En cours',   color: 'bg-blue-500/20 text-blue-300 border-blue-500/30',       dot: 'bg-blue-400'    },
  termine:  { label: 'Terminé',    color: 'bg-green-500/20 text-green-300 border-green-500/30',    dot: 'bg-green-400'   },
  paye:     { label: 'Payé',       color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', dot: 'bg-emerald-400' },
  annule:   { label: 'Annulé',     color: 'bg-red-500/20 text-red-300 border-red-500/30',          dot: 'bg-red-400'     },
};

// Types de sujets — libres mais avec des étiquettes intelligentes
const SUBJECT_TYPES: { value: SubjectType; label: string; refLabel: string; infoLabel: string }[] = [
  { value: 'vehicule',  label: 'Véhicule',   refLabel: 'Plaque / Immat.', infoLabel: 'Marque & modèle'    },
  { value: 'appareil',  label: 'Appareil',   refLabel: 'N° série / IMEI', infoLabel: 'Marque & modèle'    },
  { value: 'billet',    label: 'Billet',     refLabel: 'N° billet / Réf', infoLabel: 'Compagnie & trajet' },
  { value: 'client',    label: 'Client',     refLabel: 'Nom / CIN',       infoLabel: 'Informations'        },
  { value: 'autre',     label: 'Autre',      refLabel: 'Référence',       infoLabel: 'Description'         },
];

const PAY_METHODS = [
  { value: 'cash',   label: 'Espèces'      },
  { value: 'mobile', label: 'Mobile Money' },
  { value: 'card',   label: 'Carte'        },
  { value: 'bank',   label: 'Virement'     },
  { value: 'check',  label: 'Chèque'       },
];

function subjectTypeCfg(type: string | null | undefined) {
  return SUBJECT_TYPES.find(t => t.value === type) ?? SUBJECT_TYPES[4];
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ServiceOrderStatus }) {
  const cfg = STATUS_CFG[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full border', cfg.color)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  );
}

function OTNumber({ n }: { n: number }) {
  return <span className="font-mono font-bold text-content-muted text-xs">OT-{String(n).padStart(4, '0')}</span>;
}

function SubjectTypePill({ type }: { type: string | null | undefined }) {
  const cfg = subjectTypeCfg(type);
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface-hover text-content-muted border border-surface-border">
      {cfg.label}
    </span>
  );
}

// ─── New / Edit OT Modal ──────────────────────────────────────────────────────

interface OTLine { _id: number; service_id: string | null; name: string; price: string; quantity: number }
let _lid = 0;
function newLine(override?: Partial<OTLine>): OTLine {
  return { _id: ++_lid, service_id: null, name: '', price: '', quantity: 1, ...override };
}

function NewOTModal({
  businessId, catalog, onClose, onCreated,
}: {
  businessId: string;
  catalog: ServiceCatalogItem[];
  onClose: () => void;
  onCreated: (o: ServiceOrder) => void;
}) {
  const [subjectType, setSubjectType] = useState<SubjectType>('vehicule');
  const [subjectRef,  setSubjectRef]  = useState('');
  const [subjectInfo, setSubjectInfo] = useState('');
  const [clientName,  setClientName]  = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [notes,       setNotes]       = useState('');
  const [lines,       setLines]       = useState<OTLine[]>([newLine()]);
  const [saving,      setSaving]      = useState(false);
  const [suggestions, setSuggestions] = useState<ServiceSubject[]>([]);
  const [showSugg,    setShowSugg]    = useState(false);
  const [showSubject, setShowSubject] = useState(true);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const typeCfg = subjectTypeCfg(subjectType);
  const total = lines.reduce((s, l) => s + (parseFloat(l.price) || 0) * l.quantity, 0);

  async function handleRefChange(val: string) {
    setSubjectRef(val);
    if (debRef.current) clearTimeout(debRef.current);
    if (val.length < 2) { setSuggestions([]); return; }
    debRef.current = setTimeout(async () => {
      const res = await searchSubjects(businessId, val);
      setSuggestions(res);
      setShowSugg(res.length > 0);
    }, 300);
  }

  function pickSubject(s: ServiceSubject) {
    setSubjectRef(s.reference);
    setSubjectInfo(s.designation ?? '');
    setSubjectType(s.type_sujet as SubjectType);
    setShowSugg(false);
  }

  function addFromCatalog(item: ServiceCatalogItem) {
    setLines(prev => {
      const empty = prev.find(l => !l.name && !l.price);
      if (empty) return prev.map(l => l._id === empty._id ? { ...l, service_id: item.id, name: item.name, price: String(item.price) } : l);
      return [...prev, newLine({ service_id: item.id, name: item.name, price: String(item.price) })];
    });
  }

  function updateLine(id: number, field: keyof OTLine, val: string | number) {
    setLines(prev => prev.map(l => l._id === id ? { ...l, [field]: val } : l));
  }

  function removeLine(id: number) {
    setLines(prev => prev.length === 1 ? [newLine()] : prev.filter(l => l._id !== id));
  }

  async function handleSubmit() {
    const validLines = lines.filter(l => l.name.trim() && parseFloat(l.price) > 0);
    if (validLines.length === 0) return;
    setSaving(true);
    try {
      const order = await createServiceOrder({
        businessId,
        subjectRef: subjectRef.trim() || undefined,
        subjectType: subjectRef.trim() ? subjectType : undefined,
        subjectInfo: subjectInfo.trim() || undefined,
        clientName:  clientName.trim() || undefined,
        clientPhone: clientPhone.trim() || undefined,
        notes:       notes.trim() || undefined,
        items: validLines.map(l => ({
          service_id: l.service_id,
          name:       l.name.trim(),
          price:      parseFloat(l.price),
          quantity:   l.quantity,
        })),
      });
      onCreated(order);
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-surface-card rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-surface-border sticky top-0 bg-surface-card z-10">
          <h2 className="text-lg font-bold text-content-primary">Nouvel ordre de travail</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-hover text-content-muted"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Subject section */}
          <div className="rounded-xl border border-surface-border overflow-hidden">
            <button
              onClick={() => setShowSubject(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 bg-surface-hover text-content-secondary hover:text-content-primary text-sm font-semibold"
            >
              <span className="flex items-center gap-2">
                <Wrench className="w-4 h-4" />Sujet de la prestation (optionnel)
              </span>
              {showSubject ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showSubject && (
              <div className="p-4 space-y-3">
                {/* Type selector */}
                <div>
                  <label className="text-xs text-content-muted font-medium mb-2 block">Type de sujet</label>
                  <div className="flex flex-wrap gap-2">
                    {SUBJECT_TYPES.map(t => (
                      <button key={t.value} onClick={() => setSubjectType(t.value)}
                        className={cn('px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors', subjectType === t.value
                          ? 'bg-brand-500/20 border-brand-500/50 text-content-brand'
                          : 'border-surface-border text-content-muted hover:bg-surface-hover')}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reference with autocomplete */}
                <div className="relative">
                  <label className="text-xs text-content-muted font-medium mb-1 block">{typeCfg.refLabel}</label>
                  <input
                    value={subjectRef}
                    onChange={e => handleRefChange(e.target.value)}
                    onBlur={() => setTimeout(() => setShowSugg(false), 200)}
                    placeholder={`ex: ${subjectType === 'vehicule' ? 'AA-1234-DK' : subjectType === 'billet' ? 'AF123-DKR-CDG' : subjectType === 'appareil' ? 'SN123456789' : 'Identifiant…'}`}
                    className="w-full px-3 py-2 rounded-lg bg-surface-input border border-surface-border text-content-primary placeholder-content-muted text-sm"
                  />
                  {showSugg && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-surface-card border border-surface-border rounded-xl shadow-xl z-20 overflow-hidden">
                      {suggestions.map(s => (
                        <button key={s.id} onMouseDown={() => pickSubject(s)}
                          className="w-full text-left px-4 py-2.5 hover:bg-surface-hover text-sm flex items-center gap-3">
                          <SubjectTypePill type={s.type_sujet} />
                          <div>
                            <p className="font-semibold text-content-primary">{s.reference}</p>
                            {s.designation && <p className="text-content-muted text-xs">{s.designation}</p>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Description */}
                <div>
                  <label className="text-xs text-content-muted font-medium mb-1 block">{typeCfg.infoLabel}</label>
                  <input value={subjectInfo} onChange={e => setSubjectInfo(e.target.value)}
                    placeholder={subjectType === 'vehicule' ? 'ex: Toyota Corolla blanche' : subjectType === 'billet' ? 'ex: Air Sénégal DKR → CDG' : subjectType === 'appareil' ? 'ex: iPhone 14 Pro noir' : 'Description…'}
                    className="w-full px-3 py-2 rounded-lg bg-surface-input border border-surface-border text-content-primary placeholder-content-muted text-sm" />
                </div>
              </div>
            )}
          </div>

          {/* Client info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-content-muted font-medium mb-1 block flex items-center gap-1"><User className="w-3 h-3" />Nom client</label>
              <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Nom du client"
                className="w-full px-3 py-2 rounded-lg bg-surface-input border border-surface-border text-content-primary placeholder-content-muted text-sm" />
            </div>
            <div>
              <label className="text-xs text-content-muted font-medium mb-1 block flex items-center gap-1"><Phone className="w-3 h-3" />Téléphone</label>
              <input value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="+221 77 000 00 00"
                className="w-full px-3 py-2 rounded-lg bg-surface-input border border-surface-border text-content-primary placeholder-content-muted text-sm" />
            </div>
          </div>

          {/* Catalog quick-add */}
          {catalog.length > 0 && (
            <div>
              <p className="text-xs text-content-muted font-semibold mb-2 uppercase tracking-wider">Prestations catalogue</p>
              <div className="flex flex-wrap gap-2">
                {catalog.map(item => (
                  <button key={item.id} onClick={() => addFromCatalog(item)}
                    className="text-xs px-3 py-1.5 rounded-full border border-surface-border bg-surface-hover hover:bg-brand-500/20 hover:border-brand-500/50 hover:text-content-brand text-content-secondary transition-colors">
                    {item.name} — {formatCurrency(item.price)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Line items */}
          <div>
            <p className="text-xs text-content-muted font-semibold mb-2 uppercase tracking-wider">Détail des prestations</p>
            <div className="space-y-2">
              {lines.map(line => (
                <div key={line._id} className="flex gap-2 items-center">
                  <input value={line.name} onChange={e => updateLine(line._id, 'name', e.target.value)} placeholder="Désignation prestation"
                    className="flex-1 px-3 py-2 rounded-lg bg-surface-input border border-surface-border text-content-primary placeholder-content-muted text-sm" />
                  <input value={line.price} onChange={e => updateLine(line._id, 'price', e.target.value)} placeholder="Prix" type="number" min={0}
                    className="w-24 px-3 py-2 rounded-lg bg-surface-input border border-surface-border text-content-primary placeholder-content-muted text-sm" />
                  <input value={line.quantity} onChange={e => updateLine(line._id, 'quantity', parseInt(e.target.value) || 1)} type="number" min={1}
                    className="w-14 px-3 py-2 rounded-lg bg-surface-input border border-surface-border text-content-primary text-sm text-center" />
                  <button onClick={() => removeLine(line._id)} className="p-2 rounded-lg hover:bg-red-500/20 text-content-muted hover:text-status-error">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setLines(prev => [...prev, newLine()])}
              className="mt-2 text-xs text-content-brand hover:text-brand-400 flex items-center gap-1 font-medium">
              <Plus className="w-3.5 h-3.5" />Ajouter une ligne
            </button>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-content-muted font-medium mb-1 block">Notes internes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Observations, remarques…"
              className="w-full px-3 py-2 rounded-lg bg-surface-input border border-surface-border text-content-primary placeholder-content-muted text-sm resize-none" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-surface-border bg-surface-card sticky bottom-0">
          <div className="text-content-primary font-bold text-lg">Total : {formatCurrency(total)}</div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-xl border border-surface-border text-content-secondary hover:bg-surface-hover text-sm font-medium">Annuler</button>
            <button onClick={handleSubmit} disabled={saving || lines.every(l => !l.name.trim())}
              className="px-5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold disabled:opacity-40">
              {saving ? 'Création…' : "Créer l'OT"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Pay Modal ────────────────────────────────────────────────────────────────

function PayModal({ order, currency, onClose, onPaid }: {
  order: ServiceOrder; currency: string; onClose: () => void; onPaid: () => void;
}) {
  const balance = order.total - order.paid_amount;
  const [amount, setAmount] = useState(String(balance));
  const [method, setMethod] = useState('cash');
  const [saving, setSaving] = useState(false);

  async function handlePay() {
    setSaving(true);
    try { await payServiceOrder(order.id, parseFloat(amount) || 0, method); onPaid(); }
    catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-surface-card rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-surface-border">
          <h2 className="text-base font-bold text-content-primary">Encaisser le paiement</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-hover text-content-muted"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-xl bg-surface-hover p-4 flex justify-between items-center">
            <span className="text-content-muted text-sm">Montant dû</span>
            <span className="text-content-primary font-bold text-lg">{formatCurrency(balance, currency)}</span>
          </div>
          <div>
            <label className="text-xs text-content-muted font-medium mb-1 block">Montant reçu</label>
            <input value={amount} onChange={e => setAmount(e.target.value)} type="number" min={0}
              className="w-full px-3 py-2.5 rounded-xl bg-surface-input border border-surface-border text-content-primary text-lg font-bold" />
          </div>
          <div>
            <label className="text-xs text-content-muted font-medium mb-2 block">Mode de paiement</label>
            <div className="grid grid-cols-3 gap-2">
              {PAY_METHODS.map(m => (
                <button key={m.value} onClick={() => setMethod(m.value)}
                  className={cn('py-2 rounded-xl border text-xs font-semibold transition-colors', method === m.value
                    ? 'bg-brand-500/20 border-brand-500/50 text-content-brand'
                    : 'border-surface-border text-content-muted hover:bg-surface-hover')}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t border-surface-border">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-surface-border text-content-secondary text-sm font-medium">Annuler</button>
          <button onClick={handlePay} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold disabled:opacity-40">
            {saving ? 'Enregistrement…' : 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Order Detail Panel ───────────────────────────────────────────────────────

function OrderDetailPanel({ order, currency, catalog, businessId, onClose, onRefresh }: {
  order: ServiceOrder; currency: string; catalog: ServiceCatalogItem[];
  businessId: string; onClose: () => void; onRefresh: () => void;
}) {
  const { business, user } = useAuthStore();
  const { success } = useNotificationStore();
  const [showPay, setShowPay] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const [editRef,    setEditRef]    = useState(order.subject_ref ?? '');
  const [editInfo,   setEditInfo]   = useState(order.subject_info ?? '');
  const [editType,   setEditType]   = useState<string>(order.subject_type ?? 'autre');
  const [editClient, setEditClient] = useState(order.client_name ?? '');
  const [editPhone,  setEditPhone]  = useState(order.client_phone ?? '');
  const [editNotes,  setEditNotes]  = useState(order.notes ?? '');
  const [editLines,  setEditLines]  = useState<OTLine[]>(
    (order.items ?? []).map(i => ({ _id: ++_lid, service_id: i.service_id, name: i.name, price: String(i.price), quantity: i.quantity }))
  );

  const balance = order.total - order.paid_amount;
  const typeCfg = subjectTypeCfg(order.subject_type);

  async function transition(newStatus: ServiceOrderStatus) {
    setBusy(true);
    try { await updateServiceOrderStatus(order.id, newStatus); onRefresh(); onClose(); }
    catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  }

  async function doCancel() {
    if (!confirm('Annuler cet ordre de travail ?')) return;
    setBusy(true);
    try { await cancelServiceOrder(order.id); onRefresh(); onClose(); }
    catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  }

  async function saveEdit() {
    const validLines = editLines.filter(l => l.name.trim() && parseFloat(l.price) > 0);
    setBusy(true);
    try {
      await updateServiceOrder(order.id, {
        subjectRef:  editRef,
        subjectType: editType,
        subjectInfo: editInfo,
        clientName:  editClient,
        clientPhone: editPhone,
        notes:       editNotes,
        items: validLines.map(l => ({
          service_id: l.service_id,
          name:       l.name.trim(),
          price:      parseFloat(l.price),
          quantity:   l.quantity,
        })),
      });
      setEditing(false);
      onRefresh(); onClose();
    } catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  }

  async function handleWhatsApp(type: 'receipt' | 'status_update') {
    if (!business || !user) return;
    try {
      setBusy(true);
      const res = await shareServiceOrderViaWhatsApp(order, business as any, user.id, { 
        type, 
        includeTracking: true 
      });
      if (res.success) success('Message WhatsApp envoyé');
      else throw new Error(res.error);
    } catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  }

  function handlePrint() {
    if (!business) return;
    printHtml(generateServiceOrderReceipt({
      id: order.id, order_number: order.order_number, created_at: order.created_at,
      subject_ref: order.subject_ref,
      subject_info: order.subject_info ?? undefined,
      client_name: order.client_name, client_phone: order.client_phone,
      status: order.status, notes: order.notes,
      items: (order.items ?? []).map(i => ({ name: i.name, price: i.price, quantity: i.quantity, total: i.total })),
      total: order.total, paid_amount: order.paid_amount, payment_method: order.payment_method,
    }, business as any));
  }

  function updateEL(id: number, field: keyof OTLine, val: string | number) {
    setEditLines(prev => prev.map(l => l._id === id ? { ...l, [field]: val } : l));
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-lg bg-surface-card border-l border-surface-border shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-surface-border shrink-0">
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-hover text-content-muted"><X className="w-5 h-5" /></button>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <OTNumber n={order.order_number} />
              <StatusBadge status={order.status} />
              {order.subject_type && <SubjectTypePill type={order.subject_type} />}
            </div>
            {order.subject_ref && <p className="text-sm font-mono font-bold text-content-primary mt-0.5">{order.subject_ref}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="p-2 rounded-xl hover:bg-surface-hover text-content-muted" title="Imprimer"><Printer className="w-4 h-4" /></button>
            {order.status !== 'paye' && order.status !== 'annule' && (
              <button onClick={() => setEditing(v => !v)} className={cn('p-2 rounded-xl hover:bg-surface-hover', editing ? 'text-brand-400 bg-brand-500/10' : 'text-content-muted')}><Edit2 className="w-4 h-4" /></button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Subject */}
          {(order.subject_ref || editing) && (
            <div className="rounded-xl bg-surface-hover p-4 space-y-3">
              <p className="text-xs text-content-muted font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5" />{order.subject_type ? typeCfg.label : 'Sujet'}
              </p>
              {editing ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2 pb-2 border-b border-surface-border">
                    {SUBJECT_TYPES.map(t => (
                      <button key={t.value} onClick={() => setEditType(t.value)}
                        className={cn('px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors', editType === t.value
                          ? 'bg-brand-500/20 border-brand-500/50 text-content-brand'
                          : 'border-surface-border text-content-muted hover:bg-surface-hover')}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <div>
                    <label className="text-[10px] text-content-muted">{subjectTypeCfg(editType).refLabel}</label>
                    <input value={editRef} onChange={e => setEditRef(e.target.value)} className="w-full px-2 py-1.5 rounded-lg bg-surface-input border border-surface-border text-content-primary text-sm mt-0.5" />
                  </div>
                  <div>
                    <label className="text-[10px] text-content-muted">{subjectTypeCfg(editType).infoLabel}</label>
                    <input value={editInfo} onChange={e => setEditInfo(e.target.value)} className="w-full px-2 py-1.5 rounded-lg bg-surface-input border border-surface-border text-content-primary text-sm mt-0.5" />
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
              <p className="text-xs text-content-muted font-semibold uppercase tracking-wider flex items-center gap-1.5"><User className="w-3.5 h-3.5" />Client</p>
              {editing ? (
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-[10px] text-content-muted">Nom</label>
                    <input value={editClient} onChange={e => setEditClient(e.target.value)} className="w-full px-2 py-1.5 rounded-lg bg-surface-input border border-surface-border text-content-primary text-sm mt-0.5" /></div>
                  <div><label className="text-[10px] text-content-muted">Téléphone</label>
                    <input value={editPhone} onChange={e => setEditPhone(e.target.value)} className="w-full px-2 py-1.5 rounded-lg bg-surface-input border border-surface-border text-content-primary text-sm mt-0.5" /></div>
                </div>
              ) : (
                <>
                  <p className="font-semibold text-content-primary">{order.client_name}</p>
                  {order.client_phone && <p className="text-sm text-content-muted">{order.client_phone}</p>}
                </>
              )}
            </div>
          )}

          {/* Items */}
          <div className="rounded-xl border border-surface-border overflow-hidden">
            <p className="text-xs text-content-muted font-semibold uppercase tracking-wider px-4 py-3 bg-surface-hover flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5" />Prestations
            </p>
            {editing ? (
              <div className="p-3 space-y-2">
                {catalog.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pb-2 border-b border-surface-border">
                    {catalog.map(item => (
                      <button key={item.id} onClick={() => setEditLines(prev => [...prev, newLine({ service_id: item.id, name: item.name, price: String(item.price) })])}
                        className="text-xs px-2.5 py-1 rounded-full border border-surface-border bg-surface-hover hover:bg-brand-500/20 hover:border-brand-500/50 hover:text-content-brand text-content-secondary">
                        + {item.name}
                      </button>
                    ))}
                  </div>
                )}
                {editLines.map(line => (
                  <div key={line._id} className="flex gap-2 items-center">
                    <input value={line.name} onChange={e => updateEL(line._id, 'name', e.target.value)} placeholder="Prestation"
                      className="flex-1 px-2 py-1.5 rounded-lg bg-surface-input border border-surface-border text-content-primary text-sm" />
                    <input value={line.price} onChange={e => updateEL(line._id, 'price', e.target.value)} type="number" min={0} placeholder="Prix"
                      className="w-20 px-2 py-1.5 rounded-lg bg-surface-input border border-surface-border text-content-primary text-sm" />
                    <input value={line.quantity} onChange={e => updateEL(line._id, 'quantity', parseInt(e.target.value) || 1)} type="number" min={1}
                      className="w-12 px-2 py-1.5 rounded-lg bg-surface-input border border-surface-border text-content-primary text-sm text-center" />
                    <button onClick={() => setEditLines(prev => prev.length === 1 ? [newLine()] : prev.filter(l => l._id !== line._id))}
                      className="p-1.5 rounded-lg hover:bg-red-500/20 text-content-muted hover:text-status-error"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                <button onClick={() => setEditLines(prev => [...prev, newLine()])} className="text-xs text-content-brand hover:text-brand-400 flex items-center gap-1 font-medium mt-1">
                  <Plus className="w-3.5 h-3.5" />Ajouter
                </button>
              </div>
            ) : (
              <div className="divide-y divide-surface-border">
                {(order.items ?? []).map(item => (
                  <div key={item.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm text-content-primary font-medium">{item.name}</p>
                      {item.quantity > 1 && <p className="text-xs text-content-muted">{item.quantity} × {formatCurrency(item.price, currency)}</p>}
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
              <label className="text-xs text-content-muted font-medium mb-1 block">Notes</label>
              <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={2}
                className="w-full px-3 py-2 rounded-xl bg-surface-input border border-surface-border text-content-primary text-sm resize-none" />
            </div>
          ) : order.notes && (
            <div className="rounded-xl bg-surface-hover p-4">
              <p className="text-xs text-content-muted font-semibold uppercase tracking-wider mb-1">Notes</p>
              <p className="text-sm text-content-secondary italic">{order.notes}</p>
            </div>
          )}

          {/* Totals */}
          <div className="rounded-xl border border-surface-border overflow-hidden">
            <div className="flex justify-between px-4 py-3">
              <span className="text-content-muted text-sm">Total</span>
              <span className="font-bold text-content-primary">{formatCurrency(order.total, currency)}</span>
            </div>
            {order.paid_amount > 0 && (
              <div className="flex justify-between px-4 py-3 border-t border-surface-border">
                <span className="text-emerald-400 text-sm">Payé</span>
                <span className="font-semibold text-emerald-400">-{formatCurrency(order.paid_amount, currency)}</span>
              </div>
            )}
            {balance > 0 && (
              <div className="flex justify-between px-4 py-3 border-t border-surface-border bg-red-500/10">
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
                {order.status === 'attente' && (
                  <button onClick={() => transition('en_cours')} disabled={busy}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-40">
                    <Play className="w-4 h-4" />Démarrer
                  </button>
                )}
                {order.status === 'en_cours' && (
                  <button onClick={() => transition('termine')} disabled={busy}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold disabled:opacity-40">
                    <CheckCircle2 className="w-4 h-4" />Terminer
                  </button>
                )}
                {order.status === 'termine' && (
                  <button onClick={() => setShowPay(true)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold">
                    <CreditCard className="w-4 h-4" />Encaisser
                  </button>
                )}
                {order.status !== 'paye' && order.status !== 'annule' && (
                  <button onClick={doCancel} disabled={busy}
                    className="p-2.5 rounded-xl border border-surface-border text-content-muted hover:bg-red-500/20 hover:text-status-error hover:border-red-500/30">
                    <XCircle className="w-4 h-4" />
                  </button>
                )}
              </div>
              {order.status === 'paye' && (
                <div className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 font-bold text-sm border border-emerald-500/20 mb-2">
                  <Check className="w-4 h-4" />Soldé — {formatCurrency(order.paid_amount, currency)}
                </div>
              )}

              {/* Barre de partage / actions secondaires */}
              <div className="flex gap-2">
                <button onClick={handlePrint} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border border-surface-border text-content-secondary text-xs font-semibold hover:bg-surface-hover">
                  <Printer className="w-3.5 h-3.5" />Imprimer
                </button>
                <button onClick={() => handleWhatsApp('receipt')} disabled={busy}
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border border-emerald-500/30 text-emerald-500 text-xs font-semibold hover:bg-emerald-500/10">
                  <MessageCircle className="w-3.5 h-3.5" />WhatsApp Reçu
                </button>
                {order.status !== 'attente' && order.status !== 'paye' && (
                  <button onClick={() => handleWhatsApp('status_update')} disabled={busy}
                    className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border border-blue-500/30 text-blue-500 text-xs font-semibold hover:bg-blue-500/10">
                    <Bell className="w-3.5 h-3.5" />Notifier
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {showPay && (
        <PayModal order={order} currency={currency} onClose={() => setShowPay(false)} onPaid={() => { setShowPay(false); onRefresh(); onClose(); }} />
      )}
    </>
  );
}

// ─── Catalog Modal ────────────────────────────────────────────────────────────

function CatalogModal({ businessId, item, onClose, onSaved }: {
  businessId: string; item?: ServiceCatalogItem; onClose: () => void; onSaved: () => void;
}) {
  const [name,       setName]       = useState(item?.name ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(item?.category_id ?? null);
  const [price,      setPrice]      = useState(String(item?.price ?? ''));
  const [duration,   setDuration]   = useState(String(item?.duration_min ?? ''));
  const [saving,     setSaving]     = useState(false);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);

  useEffect(() => {
    getServiceCategories(businessId).then(setCategories);
  }, [businessId]);

  async function handleSave() {
    if (!name.trim() || !price) return;
    setSaving(true);
    try {
      await upsertServiceCatalogItem(businessId, {
        id:           item?.id,
        name:         name.trim(),
        category_id:  categoryId,
        price:        parseFloat(price) || 0,
        duration_min: duration ? parseInt(duration) : null,
        sort_order:   item?.sort_order ?? 0,
      });
      onSaved();
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-surface-card rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-surface-border">
          <h3 className="font-bold text-content-primary">{item ? 'Modifier prestation' : 'Nouvelle prestation'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-hover text-content-muted"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs text-content-muted font-medium mb-1 block">Nom</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="ex: Lavage complet"
              className="w-full px-3 py-2 rounded-xl bg-surface-input border border-surface-border text-content-primary text-sm" />
          </div>
          <div>
            <label className="text-xs text-content-muted font-medium mb-1 block">Catégorie</label>
            <select value={categoryId || ''} onChange={e => setCategoryId(e.target.value || null)}
              className="w-full px-3 py-2 rounded-xl bg-surface-input border border-surface-border text-content-primary text-sm appearance-none">
              <option value="">Aucune catégorie</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-content-muted font-medium mb-1 block">Prix</label>
              <input value={price} onChange={e => setPrice(e.target.value)} type="number" min={0} placeholder="0"
                className="w-full px-3 py-2 rounded-xl bg-surface-input border border-surface-border text-content-primary text-sm" />
            </div>
            <div>
              <label className="text-xs text-content-muted font-medium mb-1 block">Durée (min)</label>
              <input value={duration} onChange={e => setDuration(e.target.value)} type="number" min={0} placeholder="optionnel"
                className="w-full px-3 py-2 rounded-xl bg-surface-input border border-surface-border text-content-primary text-sm" />
            </div>
          </div>
        </div>
        <div className="flex gap-3 p-4 border-t border-surface-border">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-surface-border text-content-secondary text-sm">Annuler</button>
          <button onClick={handleSave} disabled={saving || !name.trim() || !price}
            className="flex-1 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold disabled:opacity-40">
            {saving ? 'Sauvegarde…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Category Manager Modal ───────────────────────────────────────────────────

function CategoryManagerModal({ businessId, onClose, onSaved }: {
  businessId: string; onClose: () => void; onSaved: () => void;
}) {
  const [cats, setCats] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const r = await getServiceCategories(businessId);
    setCats(r);
    setLoading(false);
  }

  useEffect(() => { load(); }, [businessId]);

  async function handleAdd() {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      await upsertServiceCategory(businessId, { name: newName.trim() });
      setNewName('');
      load();
      onSaved();
    } catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer cette catégorie ? Les prestations liées ne seront pas supprimées.')) return;
    try {
      await deleteServiceCategory(id);
      load();
      onSaved();
    } catch (e: any) { alert(e.message); }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-surface-card rounded-[32px] w-full max-w-md shadow-2xl overflow-hidden border border-surface-border">
        <div className="flex items-center justify-between p-6 border-b border-surface-border">
          <h3 className="text-xl font-bold text-content-primary">Gérer les catégories</h3>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-surface-hover"><X className="w-5 h-5" /></button>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="flex gap-2">
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nouvelle catégorie..."
              className="flex-1 px-4 py-3 rounded-2xl bg-surface-hover border border-surface-border focus:bg-surface-card focus:border-brand-500 outline-none transition-all text-sm font-medium" />
            <button onClick={handleAdd} disabled={busy || !newName.trim()}
              className="p-3 rounded-2xl bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40 shadow-lg shadow-brand-500/20">
              <Plus className="w-5 h-5" />
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {loading ? <div className="text-center py-4"><RefreshCw className="w-6 h-6 animate-spin mx-auto text-content-muted" /></div> :
             cats.length === 0 ? <p className="text-center py-4 text-sm text-content-muted italic">Aucune catégorie</p> :
             cats.map(c => (
               <div key={c.id} className="flex items-center justify-between p-3 rounded-2xl bg-surface-hover border border-surface-border">
                 <span className="text-sm font-bold text-content-primary ml-1">{c.name}</span>
                 <button onClick={() => handleDelete(c.id)} className="p-2 rounded-lg text-content-muted hover:text-status-error hover:bg-red-500/10 transition-colors">
                   <Trash2 className="w-4 h-4" />
                 </button>
               </div>
             ))}
          </div>
        </div>

        <div className="p-6 bg-surface-hover border-t border-surface-border">
           <button onClick={onClose} className="w-full py-4 rounded-2xl bg-surface-card border border-surface-border text-content-primary font-bold hover:bg-surface-hover transition-all">
             Fermer
           </button>
        </div>
      </div>
    </div>
  );
}

// ─── Subjects Tab ─────────────────────────────────────────────────────────────

function SubjectsTab({ businessId, currency }: { businessId: string; currency: string }) {
  const [subjects, setSubjects] = useState<ServiceSubject[]>([]);
  const [search,   setSearch]   = useState('');
  const [selected, setSelected] = useState<ServiceSubject | null>(null);
  const [history,  setHistory]  = useState<ServiceOrder[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    setLoading(true);
    getSubjects(businessId).then(r => { setSubjects(r); setLoading(false); });
  }, [businessId]);

  useEffect(() => {
    if (!selected) { setHistory([]); return; }
    getSubjectHistory(businessId, selected.id).then(setHistory);
  }, [selected, businessId]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return subjects.filter(s =>
      s.reference.toLowerCase().includes(q) ||
      (s.designation ?? '').toLowerCase().includes(q) ||
      s.type_sujet.toLowerCase().includes(q)
    );
  }, [subjects, search]);

  return (
    <div className="flex gap-4 h-full">
      <div className="flex-1 flex flex-col min-h-0">
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher par référence, description…"
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-surface-input border border-surface-border text-content-primary text-sm" />
        </div>
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-content-muted"><RefreshCw className="w-5 h-5 animate-spin mr-2" />Chargement…</div>
        ) : filtered.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-content-muted gap-2">
            <Package2 className="w-10 h-10 opacity-30" />
            <p className="text-sm">Aucun sujet trouvé</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-2">
            {filtered.map(s => (
              <button key={s.id} onClick={() => setSelected(selected?.id === s.id ? null : s)}
                className={cn('w-full text-left rounded-xl border p-3 transition-colors', selected?.id === s.id
                  ? 'bg-brand-500/10 border-brand-500/30 text-content-brand'
                  : 'border-surface-border hover:bg-surface-hover text-content-primary')}>
                <div className="flex items-center gap-2 mb-0.5">
                  <SubjectTypePill type={s.type_sujet} />
                  <p className="font-mono font-bold text-sm">{s.reference}</p>
                </div>
                {s.designation && <p className="text-xs text-content-muted">{s.designation}</p>}
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="w-80 flex flex-col min-h-0 border-l border-surface-border pl-4">
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-1"><SubjectTypePill type={selected.type_sujet} /></div>
            <h3 className="font-bold text-content-primary font-mono">{selected.reference}</h3>
            {selected.designation && <p className="text-sm text-content-muted">{selected.designation}</p>}
          </div>
          <p className="text-xs text-content-muted font-semibold uppercase tracking-wider flex items-center gap-1.5 mb-2">
            <History className="w-3.5 h-3.5" />Historique ({history.length})
          </p>
          <div className="flex-1 overflow-y-auto space-y-2">
            {history.length === 0 ? (
              <p className="text-content-muted text-sm">Aucun historique</p>
            ) : history.map(o => (
              <div key={o.id} className="rounded-xl border border-surface-border p-3">
                <div className="flex items-center justify-between mb-1">
                  <OTNumber n={o.order_number} />
                  <StatusBadge status={o.status} />
                </div>
                <p className="text-xs text-content-muted">{new Date(o.created_at).toLocaleDateString('fr-FR')}</p>
                <p className="text-sm font-semibold text-content-primary mt-1">{formatCurrency(o.total, currency)}</p>
                {(o.items ?? []).slice(0, 2).map(i => <p key={i.id} className="text-xs text-content-muted">· {i.name}</p>)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type PageTab = 'orders' | 'catalog' | 'subjects';

export default function ServicesPage() {
  const { business } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();
  const currency = business?.currency ?? 'XOF';
  const businessId = business?.id ?? '';

  const [tab,          setTab]          = useState<PageTab>('orders');
  const [orders,       setOrders]       = useState<ServiceOrder[]>([]);
  const [catalog,      setCatalog]      = useState<ServiceCatalogItem[]>([]);
  const [allCatalog,   setAllCatalog]   = useState<ServiceCatalogItem[]>([]);
  const [serviceCategories, setServiceCategories] = useState<ServiceCategory[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [statusFilter, setStatusFilter] = useState<ServiceOrderStatus | 'all'>('all');
  const [search,       setSearch]       = useState('');
  const [dateFilter,   setDateFilter]   = useState('');
  const [showNewOT,    setShowNewOT]    = useState(false);
  const [selectedOrder,  setSelectedOrder]  = useState<ServiceOrder | null>(null);
  const [catalogModal, setCatalogModal] = useState<{ item?: ServiceCatalogItem } | null>(null);
  const [showCategoryManager, setShowCategoryManager] = useState(false);

  function copyPublicLink() {
    if (!business) return;
    const ref = buildPublicBusinessRef(business.name, business.public_slug);
    const url = `${window.location.origin}/services/${ref}`;
    navigator.clipboard.writeText(url);
    success('Lien public copié !');
  }


  async function loadOrders() {
    if (!businessId) return;
    setLoading(true);
    try {
      const [o, c, ac, cats] = await Promise.all([
        getServiceOrders(businessId, { date: dateFilter || undefined }),
        getServiceCatalog(businessId),
        getAllServiceCatalog(businessId),
        getServiceCategories(businessId),
      ]);
      setOrders(o); setCatalog(c); setAllCatalog(ac); setServiceCategories(cats);
    } catch (e: any) { notifError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadOrders(); }, [businessId, dateFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length };
    for (const o of orders) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [orders]);

  const filtered = useMemo(() => {
    let list = orders;
    if (statusFilter !== 'all') list = list.filter(o => o.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(o =>
        (o.subject_ref ?? '').toLowerCase().includes(q) ||
        (o.subject_info ?? '').toLowerCase().includes(q) ||
        (o.client_name ?? '').toLowerCase().includes(q) ||
        (o.items ?? []).some(i => i.name.toLowerCase().includes(q))
      );
    }
    return list;
  }, [orders, statusFilter, search]);

  async function quickTransition(id: string, status: ServiceOrderStatus, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await updateServiceOrderStatus(id, status);
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
      success('Statut mis à jour');
    } catch (err: any) { notifError(err.message); }
  }

  async function deleteCatalogItem(id: string) {
    if (!confirm('Supprimer cette prestation ?')) return;
    try { await deleteServiceCatalogItem(id); await loadOrders(); success('Prestation supprimée'); }
    catch (e: any) { notifError(e.message); }
  }

  async function toggleCatalog(id: string, active: boolean) {
    try { await toggleServiceCatalogItem(id, active); await loadOrders(); }
    catch (e: any) { notifError(e.message); }
  }

  function handlePrintOrder(o: ServiceOrder, e: React.MouseEvent) {
    e.stopPropagation();
    if (!business) return;
    printHtml(generateServiceOrderReceipt({
      id: o.id, order_number: o.order_number, created_at: o.created_at,
      subject_ref: o.subject_ref,
      subject_info: o.subject_info ?? undefined,
      client_name: o.client_name, client_phone: o.client_phone,
      status: o.status, notes: o.notes,
      items: (o.items ?? []).map(i => ({ name: i.name, price: i.price, quantity: i.quantity, total: i.total })),
      total: o.total, paid_amount: o.paid_amount, payment_method: o.payment_method,
    }, business as any));
  }

  const STATUS_TABS = [
    { key: 'all',      label: 'Tous'     },
    { key: 'attente',  label: 'Attente'  },
    { key: 'en_cours', label: 'En cours' },
    { key: 'termine',  label: 'Terminé'  },
    { key: 'paye',     label: 'Payé'     },
    { key: 'annule',   label: 'Annulé'   },
  ] as const;

  return (
    <div className="flex flex-col h-full bg-surface-base">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-surface-card border-b border-surface-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-500/20 flex items-center justify-center">
            <Wrench className="w-5 h-5 text-content-brand" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-content-primary">Prestations de service</h1>
            <p className="text-xs text-content-muted">{counts.all} ordre{counts.all !== 1 ? 's' : ''} de travail</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={copyPublicLink}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-surface-border text-content-secondary text-sm font-medium hover:bg-surface-hover">
            <Share2 className="w-4 h-4" />Partager
          </button>
          <button onClick={() => setShowNewOT(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold shadow-sm">
            <Plus className="w-4 h-4" />Nouvel OT
          </button>
        </div>
      </div>
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-6 py-3 bg-surface-card border-b border-surface-border shrink-0">
        {([
          { key: 'orders',   label: 'Ordres de travail' },
          { key: 'catalog',  label: 'Catalogue' },
          { key: 'subjects', label: 'Sujets / Historique' },
        ] as const).map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn('flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors', tab === key
              ? 'bg-brand-500/15 text-content-brand border border-brand-500/30'
              : 'text-content-muted hover:text-content-primary hover:bg-surface-hover')}>
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {tab === 'orders' && (
          <>
            {/* Filters */}
            <div className="px-6 py-3 bg-surface-card border-b border-surface-border shrink-0 space-y-3">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher référence, client, prestation…"
                    className="w-full pl-9 pr-4 py-2 rounded-xl bg-surface-input border border-surface-border text-content-primary text-sm" />
                </div>
                <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-surface-input border border-surface-border text-content-primary text-sm" />
                {dateFilter && (
                  <button onClick={() => setDateFilter('')} className="p-2 rounded-xl hover:bg-surface-hover text-content-muted"><X className="w-4 h-4" /></button>
                )}
                <button onClick={loadOrders} className="p-2 rounded-xl hover:bg-surface-hover text-content-muted"><RefreshCw className="w-4 h-4" /></button>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {STATUS_TABS.map(({ key, label }) => (
                  <button key={key} onClick={() => setStatusFilter(key as any)}
                    className={cn('flex-none flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors', statusFilter === key
                      ? 'bg-brand-500 text-white'
                      : 'bg-surface-hover text-content-muted hover:text-content-primary')}>
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
            <div className="flex-1 overflow-y-auto p-6">
              {loading ? (
                <div className="flex items-center justify-center h-40 text-content-muted">
                  <RefreshCw className="w-5 h-5 animate-spin mr-2" />Chargement…
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-content-muted gap-3">
                  <Wrench className="w-12 h-12 opacity-20" />
                  <p className="text-sm">Aucun ordre de travail</p>
                  <button onClick={() => setShowNewOT(true)} className="text-xs text-content-brand hover:underline flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" />Créer un OT
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filtered.map(order => {
                    const balance = order.total - order.paid_amount;
                    return (
                      <div key={order.id} onClick={() => setSelectedOrder(order)}
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
                          {order.subject_info && <p className="text-xs text-content-muted mb-1">{order.subject_info}</p>}
                          {order.client_name && (
                            <p className="text-sm text-content-secondary flex items-center gap-1 mb-1"><User className="w-3 h-3" />{order.client_name}</p>
                          )}

                          <div className="mt-2 space-y-0.5">
                            {(order.items ?? []).slice(0, 3).map(item => (
                              <p key={item.id} className="text-xs text-content-muted truncate">· {item.name}{item.quantity > 1 ? ` ×${item.quantity}` : ''}</p>
                            ))}
                            {(order.items ?? []).length > 3 && <p className="text-xs text-content-muted">+{(order.items ?? []).length - 3} autres…</p>}
                          </div>

                          <div className="mt-3 flex items-center justify-between">
                            <div>
                              <span className="text-base font-bold text-content-primary">{formatCurrency(order.total, currency)}</span>
                              {balance > 0 && balance < order.total && (
                                <span className="ml-2 text-xs text-status-error">reste {formatCurrency(balance, currency)}</span>
                              )}
                            </div>
                            <span className="text-xs text-content-muted">{new Date(order.created_at).toLocaleDateString('fr-FR')}</span>
                          </div>
                        </div>

                        {/* Quick actions */}
                        <div className="flex border-t border-surface-border divide-x divide-surface-border">
                          {order.status === 'attente' && (
                            <button onClick={e => quickTransition(order.id, 'en_cours', e)}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-blue-400 hover:bg-blue-500/10 transition-colors">
                              <Play className="w-3.5 h-3.5" />Démarrer
                            </button>
                          )}
                          {order.status === 'en_cours' && (
                            <button onClick={e => quickTransition(order.id, 'termine', e)}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-green-400 hover:bg-green-500/10 transition-colors">
                              <CheckCircle2 className="w-3.5 h-3.5" />Terminer
                            </button>
                          )}
                          {order.status === 'termine' && (
                            <button onClick={e => { e.stopPropagation(); setSelectedOrder(order); }}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/10 transition-colors">
                              <CreditCard className="w-3.5 h-3.5" />Encaisser
                            </button>
                          )}
                          {(order.status === 'paye' || order.status === 'annule') && (
                            <div className="flex-1" />
                          )}
                          <button onClick={e => handlePrintOrder(order, e)}
                            className="px-4 flex items-center justify-center text-content-muted hover:text-content-primary hover:bg-surface-hover transition-colors">
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'catalog' && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-content-primary">Catalogue des prestations</h2>
                <div className="flex gap-2">
                  <button onClick={() => setShowCategoryManager(true)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl border border-surface-border text-content-secondary text-sm font-medium hover:bg-surface-hover">
                    <LayoutGrid className="w-4 h-4" />Catégories
                  </button>
                  <button onClick={() => setCatalogModal({})}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-brand-500/15 hover:bg-brand-500/25 text-content-brand text-sm font-medium">
                    <Plus className="w-4 h-4" />Nouvelle prestation
                  </button>
                </div>
              </div>

              {allCatalog.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-content-muted gap-3">
                  <Package2 className="w-12 h-12 opacity-20" />
                  <p className="text-sm">Aucune prestation dans le catalogue</p>
                  <button onClick={() => setCatalogModal({})} className="text-xs text-content-brand hover:underline">Ajouter une prestation</button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Groupement par catégories dynamiques */}
                  {(serviceCategories.length > 0 ? serviceCategories : [{ id: null, name: 'Autres' } as any]).map(cat => {
                    const items = allCatalog.filter(i => (i.category_id === cat.id) || (!i.category_id && !cat.id));
                    if (items.length === 0) return null;
                    return (
                      <div key={cat.id || 'none'}>
                        <p className="text-xs font-bold text-content-muted uppercase tracking-widest mb-3 flex items-center gap-2">
                          <span className="w-1 h-3 bg-brand-500 rounded-full" />
                          {cat.name}
                        </p>
                        <div className="space-y-1">
                          {items.map(item => (
                            <div key={item.id} className={cn('flex items-center gap-3 p-3 rounded-xl border transition-colors',
                              item.is_active ? 'bg-surface-card border-surface-border' : 'bg-surface-hover border-surface-border opacity-60')}>
                              <div className="flex-1 min-w-0">
                                <p className={cn('text-sm font-semibold', item.is_active ? 'text-content-primary' : 'text-content-muted line-through')}>{item.name}</p>
                                {item.duration_min && <p className="text-xs text-content-muted">{item.duration_min} min</p>}
                              </div>
                              <span className="font-bold text-content-primary text-sm">{formatCurrency(item.price, currency)}</span>
                              <div className="flex items-center gap-1">
                                <button onClick={() => toggleCatalog(item.id, !item.is_active)}
                                  className={cn('p-1.5 rounded-lg transition-colors', item.is_active ? 'text-green-400 hover:bg-green-500/10' : 'text-content-muted hover:bg-surface-hover')}>
                                  {item.is_active ? <Check className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                                </button>
                                <button onClick={() => setCatalogModal({ item })} className="p-1.5 rounded-lg hover:bg-surface-hover text-content-muted"><Edit2 className="w-4 h-4" /></button>
                                <button onClick={() => deleteCatalogItem(item.id)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-content-muted hover:text-status-error"><Trash2 className="w-4 h-4" /></button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'subjects' && (
          <div className="flex-1 overflow-hidden p-6">
            <SubjectsTab businessId={businessId} currency={currency} />
          </div>
        )}
      </div>

      {/* Modals */}
      {showNewOT && (
        <NewOTModal businessId={businessId} catalog={catalog} onClose={() => setShowNewOT(false)}
          onCreated={order => { setShowNewOT(false); setOrders(prev => [{ ...order, items: order.items ?? [] }, ...prev]); success('Ordre de travail créé'); }} />
      )}

      {selectedOrder && (
        <OrderDetailPanel order={selectedOrder} currency={currency} catalog={catalog}
          businessId={businessId} onClose={() => setSelectedOrder(null)} onRefresh={() => { loadOrders(); setSelectedOrder(null); }} />
      )}

      {catalogModal !== null && (
        <CatalogModal businessId={businessId} item={catalogModal.item} onClose={() => setCatalogModal(null)}
          onSaved={() => { setCatalogModal(null); loadOrders(); success('Catalogue mis à jour'); }} />
      )}

      {showCategoryManager && (
        <CategoryManagerModal businessId={businessId} onClose={() => setShowCategoryManager(false)}
          onSaved={() => { loadOrders(); }} />
      )}
    </div>
  );
}
