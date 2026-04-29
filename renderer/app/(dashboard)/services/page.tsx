'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Plus, Search, Printer, X, Check, Wrench,
  CheckCircle2, XCircle, Edit2, Trash2, Play,
  Square, CreditCard, Package2, ChevronDown, ChevronUp,
  RefreshCw, User, Phone, History, MessageCircle, Bell,
  ExternalLink, Share2, LayoutGrid, ChevronLeft, ChevronRight, Pencil
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { useCan } from '@/hooks/usePermission';
import { cn, formatCurrency } from '@/lib/utils';
import { toUserError } from '@/lib/user-error';
import {
  getServiceOrders, getServiceOrderCounts, getServiceCatalog, getAllServiceCatalog, getSubjects,
  createServiceOrder, updateServiceOrderStatus, payServiceOrder,
  updateServiceOrder, cancelServiceOrder,
  getServiceCategories, upsertServiceCategory, deleteServiceCategory,
  upsertServiceCatalogItem, toggleServiceCatalogItem, deleteServiceCatalogItem,
  searchSubjects, getSubjectHistory, getOrdersSummary, getOrdersByClientName,
  type ServiceOrder, type ServiceOrderStatus, type ServiceCatalogItem,
  type ServiceSubject, type ServiceCategory, type SubjectType, type ServiceOrderSummary,
} from '@services/supabase/service-orders';
import { generateServiceOrderReceipt, printHtml } from '@/lib/invoice-templates';
import { shareServiceOrderViaWhatsApp } from '@/lib/share-service-order';
import { buildPublicBusinessRef } from '@services/supabase/public-business-ref';
import { searchClients, type Client } from '@services/supabase/clients';
import { getStaff, type Staff } from '@services/supabase/staff';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_CFG: Record<ServiceOrderStatus, { label: string; color: string; dot: string }> = {
  attente:  { label: 'En attente', color: 'bg-badge-warning  text-status-warning  border-status-warning/30',  dot: 'bg-status-warning'  },
  en_cours: { label: 'En cours',   color: 'bg-badge-info     text-status-info     border-status-info/30',     dot: 'bg-status-info'     },
  termine:  { label: 'Terminé',    color: 'bg-badge-success  text-status-success  border-status-success/30',  dot: 'bg-status-success'  },
  paye:     { label: 'Payé',       color: 'bg-badge-success  text-status-success  border-status-success/30',  dot: 'bg-status-success'  },
  annule:   { label: 'Annulé',     color: 'bg-badge-error    text-status-error    border-status-error/30',    dot: 'bg-status-error'    },
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
  return <span className="font-mono font-bold text-content-primary text-xs">OT-{String(n).padStart(4, '0')}</span>;
}

function SubjectTypePill({ type }: { type: string | null | undefined }) {
  const cfg = subjectTypeCfg(type);
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface-hover text-content-secondary border border-surface-border">
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
  const { user } = useAuthStore();
  const { error: notifError } = useNotificationStore();
  const [subjectType, setSubjectType] = useState<SubjectType>('vehicule');
  const [subjectRef,  setSubjectRef]  = useState('');
  const [subjectInfo, setSubjectInfo] = useState('');
  const [clientName,  setClientName]  = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [notes,       setNotes]       = useState('');
  const [lines,       setLines]       = useState<OTLine[]>([newLine()]);
  const [saving,        setSaving]        = useState(false);
  const [suggestions,   setSuggestions]   = useState<ServiceSubject[]>([]);
  const [showSugg,      setShowSugg]      = useState(false);
  const [showSubject,   setShowSubject]   = useState(true);
  const [clientSugg,    setClientSugg]    = useState<Client[]>([]);
  const [showClientSugg, setShowClientSugg] = useState(false);
  const [staffList,       setStaffList]       = useState<Staff[]>([]);
  const [assignedTo,      setAssignedTo]      = useState<string>('');
  const [catalogSearch,   setCatalogSearch]   = useState('');
  const [showCatalogDrop, setShowCatalogDrop] = useState(false);
  const debRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debClient = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getStaff(businessId).then(setStaffList).catch(() => {});
  }, [businessId]);

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

  function handleClientSearch(val: string, field: 'name' | 'phone') {
    if (field === 'name') setClientName(val);
    else setClientPhone(val);
    if (debClient.current) clearTimeout(debClient.current);
    if (val.length < 2) { setClientSugg([]); setShowClientSugg(false); return; }
    debClient.current = setTimeout(async () => {
      const res = await searchClients(businessId, val);
      setClientSugg(res);
      setShowClientSugg(res.length > 0);
    }, 250);
  }

  function pickClient(c: Client) {
    setClientName(c.name);
    setClientPhone(c.phone ?? '');
    setClientSugg([]);
    setShowClientSugg(false);
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
        assignedTo:  assignedTo || undefined,
        assignedName: staffList.find(s => s.id === assignedTo)?.name || undefined,
        notes:       notes.trim() || undefined,
        createdBy:   user?.id,
        createdByName: user?.full_name,
        items: validLines.map(l => ({
          service_id: l.service_id,
          name:       l.name.trim(),
          price:      parseFloat(l.price),
          quantity:   l.quantity,
        })),
      });
      onCreated(order);
    } catch (e: any) { notifError(toUserError(e)); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-surface-card rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-surface-border sticky top-0 bg-surface-card z-10">
          <h2 className="text-lg font-bold text-content-primary">Nouvel ordre de travail</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-hover text-content-secondary"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Aide rapide */}
          <div className="bg-brand-500/5 border border-brand-500/15 rounded-xl px-4 py-3 space-y-1">
            <p className="text-xs font-bold text-content-brand uppercase tracking-widest">Comment ça marche</p>
            <ul className="text-xs text-content-secondary space-y-1 mt-1">
              <li>· <strong className="text-content-primary">Client :</strong> tapez un nom ou numéro — les clients existants apparaissent. Sélectionnez pour remplir automatiquement.</li>
              <li>· <strong className="text-content-primary">Assigné à :</strong> choisissez le technicien responsable de cet OT.</li>
              <li>· <strong className="text-content-primary">Sujet :</strong> véhicule, appareil ou autre objet de la prestation (optionnel).</li>
            </ul>
          </div>

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
                  <label className="text-xs text-content-secondary font-medium mb-2 block">Type de sujet</label>
                  <div className="flex flex-wrap gap-2">
                    {SUBJECT_TYPES.map(t => (
                      <button key={t.value} onClick={() => setSubjectType(t.value)}
                        className={cn('px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors', subjectType === t.value
                          ? 'bg-brand-500/20 border-brand-500/50 text-content-brand'
                          : 'border-surface-border text-content-secondary hover:bg-surface-hover')}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reference with autocomplete */}
                <div className="relative">
                  <label className="text-xs text-content-secondary font-medium mb-1 block">{typeCfg.refLabel}</label>
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
                            {s.designation && <p className="text-content-secondary text-xs">{s.designation}</p>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Description */}
                <div>
                  <label className="text-xs text-content-secondary font-medium mb-1 block">{typeCfg.infoLabel}</label>
                  <input value={subjectInfo} onChange={e => setSubjectInfo(e.target.value)}
                    placeholder={subjectType === 'vehicule' ? 'ex: Toyota Corolla blanche' : subjectType === 'billet' ? 'ex: Air Sénégal DKR → CDG' : subjectType === 'appareil' ? 'ex: iPhone 14 Pro noir' : 'Description…'}
                    className="w-full px-3 py-2 rounded-lg bg-surface-input border border-surface-border text-content-primary placeholder-content-muted text-sm" />
                </div>
              </div>
            )}
          </div>

          {/* Client info */}
          <div className="grid grid-cols-2 gap-3 relative">
            {/* Dropdown suggestions */}
            {showClientSugg && clientSugg.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-surface-card border border-surface-border rounded-xl shadow-xl overflow-hidden col-span-2">
                {clientSugg.map(c => (
                  <button key={c.id} onMouseDown={() => pickClient(c)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-hover text-left transition-colors border-b border-surface-border last:border-0">
                    <div className="w-8 h-8 rounded-full bg-brand-500/10 flex items-center justify-center shrink-0 text-xs font-bold text-content-brand">
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
            <div>
              <label className="text-xs text-content-secondary font-medium mb-1 block flex items-center gap-1"><User className="w-3 h-3" />Nom client</label>
              <input
                value={clientName}
                onChange={e => handleClientSearch(e.target.value, 'name')}
                onFocus={() => clientName.length >= 2 && setShowClientSugg(clientSugg.length > 0)}
                onBlur={() => setTimeout(() => setShowClientSugg(false), 150)}
                placeholder="Nom du client"
                className="w-full px-3 py-2 rounded-lg bg-surface-input border border-surface-border text-content-primary placeholder-content-muted text-sm" />
            </div>
            <div>
              <label className="text-xs text-content-secondary font-medium mb-1 block flex items-center gap-1"><Phone className="w-3 h-3" />Téléphone</label>
              <input
                value={clientPhone}
                onChange={e => handleClientSearch(e.target.value, 'phone')}
                onFocus={() => clientPhone.length >= 2 && setShowClientSugg(clientSugg.length > 0)}
                onBlur={() => setTimeout(() => setShowClientSugg(false), 150)}
                placeholder="+221 77 000 00 00"
                className="w-full px-3 py-2 rounded-lg bg-surface-input border border-surface-border text-content-primary placeholder-content-muted text-sm" />
            </div>
          </div>

          {/* Assignation technicien */}
          {staffList.filter(s => s.status === 'active').length > 0 && (
            <div>
              <label className="text-xs text-content-secondary font-medium mb-1 block flex items-center gap-1">
                <Wrench className="w-3 h-3" />Assigner à
              </label>
              <select
                value={assignedTo}
                onChange={e => setAssignedTo(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface-input border border-surface-border text-content-primary text-sm">
                <option value="">— Non assigné —</option>
                {staffList.filter(s => s.status === 'active').map(s => (
                  <option key={s.id} value={s.id}>{s.name}{s.position ? ` · ${s.position}` : ''}</option>
                ))}
              </select>
            </div>
          )}

          {/* Catalog quick-add — recherche */}
          {catalog.length > 0 && (
            <div className="relative">
              <p className="text-xs text-content-secondary font-semibold mb-2 uppercase tracking-wider">Ajouter depuis le catalogue</p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-muted pointer-events-none" />
                <input
                  value={catalogSearch}
                  onChange={e => { setCatalogSearch(e.target.value); setShowCatalogDrop(true); }}
                  onFocus={() => setShowCatalogDrop(true)}
                  onBlur={() => setTimeout(() => setShowCatalogDrop(false), 150)}
                  placeholder="Rechercher une prestation…"
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-input border border-surface-border text-content-primary placeholder-content-muted text-sm"
                />
              </div>
              {showCatalogDrop && catalogSearch.length >= 1 && (
                <div className="absolute left-0 right-0 z-40 mt-1 bg-surface-card border border-surface-border rounded-xl shadow-xl overflow-hidden max-h-52 overflow-y-auto">
                  {catalog
                    .filter(i => i.name.toLowerCase().includes(catalogSearch.toLowerCase()))
                    .slice(0, 20)
                    .map(item => (
                      <button key={item.id}
                        onMouseDown={() => { addFromCatalog(item); setCatalogSearch(''); setShowCatalogDrop(false); }}
                        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-surface-hover text-left border-b border-surface-border last:border-0 transition-colors">
                        <div>
                          <p className="text-sm font-medium text-content-primary">{item.name}</p>
                          {item.service_category?.name && <p className="text-[10px] text-content-muted">{item.service_category.name}</p>}
                        </div>
                        <span className="text-sm font-bold text-content-brand shrink-0 ml-3">{formatCurrency(item.price)}</span>
                      </button>
                    ))}
                  {catalog.filter(i => i.name.toLowerCase().includes(catalogSearch.toLowerCase())).length === 0 && (
                    <p className="px-4 py-3 text-sm text-content-muted italic">Aucune prestation trouvée</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Line items */}
          <div>
            <p className="text-xs text-content-secondary font-semibold mb-2 uppercase tracking-wider">Détail des prestations</p>
            <div className="space-y-2">
              {lines.map(line => (
                <div key={line._id} className="flex gap-2 items-center">
                  <input value={line.name} onChange={e => updateLine(line._id, 'name', e.target.value)} placeholder="Désignation prestation"
                    className="flex-1 px-3 py-2 rounded-lg bg-surface-input border border-surface-border text-content-primary placeholder-content-muted text-sm" />
                  <input value={line.price} onChange={e => updateLine(line._id, 'price', e.target.value)} placeholder="Prix" type="number" min={0}
                    className="w-24 px-3 py-2 rounded-lg bg-surface-input border border-surface-border text-content-primary placeholder-content-muted text-sm" />
                  <input value={line.quantity} onChange={e => updateLine(line._id, 'quantity', parseInt(e.target.value) || 1)} type="number" min={1}
                    className="w-14 px-3 py-2 rounded-lg bg-surface-input border border-surface-border text-content-primary text-sm text-center" />
                  <button onClick={() => removeLine(line._id)} className="p-2 rounded-lg hover:bg-red-500/20 text-content-secondary hover:text-status-error">
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
            <label className="text-xs text-content-secondary font-medium mb-1 block">Notes internes</label>
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
  const { user } = useAuthStore();
  const { error: notifError } = useNotificationStore();
  const balance = order.total - order.paid_amount;
  const [amount, setAmount] = useState(String(balance));
  const [method, setMethod] = useState('cash');
  const [saving, setSaving] = useState(false);

  async function handlePay() {
    setSaving(true);
    try { await payServiceOrder(order.id, parseFloat(amount) || 0, method, { userId: user?.id, userName: user?.full_name }); onPaid(); }
    catch (e: any) { notifError(toUserError(e)); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-surface-card rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-surface-border">
          <h2 className="text-base font-bold text-content-primary">Encaisser le paiement</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-hover text-content-secondary"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-xl bg-surface-hover p-4 flex justify-between items-center">
            <span className="text-content-secondary text-sm">Montant dû</span>
            <span className="text-content-primary font-bold text-lg">{formatCurrency(balance, currency)}</span>
          </div>
          <div>
            <label className="text-xs text-content-secondary font-medium mb-1 block">Montant reçu</label>
            <input value={amount} onChange={e => setAmount(e.target.value)} type="number" min={0}
              className="w-full px-3 py-2.5 rounded-xl bg-surface-input border border-surface-border text-content-primary text-lg font-bold" />
          </div>
          <div>
            <label className="text-xs text-content-secondary font-medium mb-2 block">Mode de paiement</label>
            <div className="grid grid-cols-3 gap-2">
              {PAY_METHODS.map(m => (
                <button key={m.value} onClick={() => setMethod(m.value)}
                  className={cn('py-2 rounded-xl border text-xs font-semibold transition-colors', method === m.value
                    ? 'bg-brand-500/20 border-brand-500/50 text-content-brand'
                    : 'border-surface-border text-content-secondary hover:bg-surface-hover')}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t border-surface-border">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-surface-border text-content-secondary text-sm font-medium">Annuler</button>
          <button onClick={handlePay} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-status-success hover:opacity-90 text-white text-sm font-bold disabled:opacity-40">
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
  const { business, businesses, user } = useAuthStore();
  const can = useCan();
  const { success, error: notifError } = useNotificationStore();
  const [showPay, setShowPay] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showWaMenu, setShowWaMenu] = useState(false);

  const [editRef,    setEditRef]    = useState(order.subject_ref ?? '');
  const [editInfo,   setEditInfo]   = useState(order.subject_info ?? '');
  const [editType,   setEditType]   = useState<string>(order.subject_type ?? 'autre');
  const [editClient, setEditClient] = useState(order.client_name ?? '');
  const [editPhone,  setEditPhone]  = useState(order.client_phone ?? '');
  const [editNotes,  setEditNotes]  = useState(order.notes ?? '');
  const [editClientSugg,     setEditClientSugg]     = useState<Client[]>([]);
  const [showEditClientSugg, setShowEditClientSugg] = useState(false);
  const [editAssignedTo,      setEditAssignedTo]      = useState(order.assigned_to ?? '');
  const [editStaffList,       setEditStaffList]       = useState<Staff[]>([]);
  const [editCatalogSearch,   setEditCatalogSearch]   = useState('');
  const [showEditCatalogDrop, setShowEditCatalogDrop] = useState(false);
  const debEditClient = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getStaff(businessId).then(s => setEditStaffList(s.filter(m => m.status === 'active'))).catch(() => {});
  }, [businessId]);
  const [editLines,  setEditLines]  = useState<OTLine[]>(
    (order.items ?? []).map(i => ({ _id: ++_lid, service_id: i.service_id, name: i.name, price: String(i.price), quantity: i.quantity }))
  );

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
    if (!confirm('Annuler cet ordre de travail ?')) return;
    setBusy(true);
    try { await cancelServiceOrder(order.id, { userId: user?.id, userName: user?.full_name }); onRefresh(); onClose(); }
    catch (e: any) { notifError(toUserError(e)); }
    finally { setBusy(false); }
  }

  async function saveEdit() {
    if (!canEditThisOrder) { deny(); return; }
    const validLines = editLines.filter(l => l.name.trim() && parseFloat(l.price) > 0);
    setBusy(true);
    try {
      await updateServiceOrder(order.id, {
        subjectRef:   editRef,
        subjectType:  editType,
        subjectInfo:  editInfo,
        clientName:   editClient,
        clientPhone:  editPhone,
        assignedTo:   editAssignedTo || null,
        assignedName: editStaffList.find(s => s.id === editAssignedTo)?.name || null,
        notes:        editNotes,
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

  function updateEL(id: number, field: keyof OTLine, val: string | number) {
    setEditLines(prev => prev.map(l => l._id === id ? { ...l, [field]: val } : l));
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
                      <button key={t.value} onClick={() => setEditType(t.value)}
                        className={cn('px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors', editType === t.value
                          ? 'bg-brand-500/20 border-brand-500/50 text-content-brand'
                          : 'border-surface-border text-content-secondary hover:bg-surface-hover')}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <div>
                    <label className="text-[10px] text-content-secondary">{subjectTypeCfg(editType).refLabel}</label>
                    <input value={editRef} onChange={e => setEditRef(e.target.value)} className="w-full px-2 py-1.5 rounded-lg bg-surface-input border border-surface-border text-content-primary text-sm mt-0.5" />
                  </div>
                  <div>
                    <label className="text-[10px] text-content-secondary">{subjectTypeCfg(editType).infoLabel}</label>
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
              <p className="text-xs text-content-secondary font-semibold uppercase tracking-wider flex items-center gap-1.5"><User className="w-3.5 h-3.5" />Client</p>
              {editing ? (
                <div className="grid grid-cols-2 gap-2 relative">
                  {showEditClientSugg && editClientSugg.length > 0 && (
                    <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-surface-card border border-surface-border rounded-xl shadow-xl overflow-hidden col-span-2">
                      {editClientSugg.map(c => (
                        <button key={c.id} onMouseDown={() => { setEditClient(c.name); setEditPhone(c.phone ?? ''); setShowEditClientSugg(false); }}
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
                    <input value={editClient}
                      onChange={e => {
                        setEditClient(e.target.value);
                        if (debEditClient.current) clearTimeout(debEditClient.current);
                        if (e.target.value.length >= 2) {
                          debEditClient.current = setTimeout(async () => {
                            const res = await searchClients(businessId, e.target.value);
                            setEditClientSugg(res); setShowEditClientSugg(res.length > 0);
                          }, 250);
                        } else { setShowEditClientSugg(false); }
                      }}
                      onBlur={() => setTimeout(() => setShowEditClientSugg(false), 150)}
                      className="w-full px-2 py-1.5 rounded-lg bg-surface-input border border-surface-border text-content-primary text-sm mt-0.5" /></div>
                  <div><label className="text-[10px] text-content-secondary">Téléphone</label>
                    <input value={editPhone}
                      onChange={e => {
                        setEditPhone(e.target.value);
                        if (debEditClient.current) clearTimeout(debEditClient.current);
                        if (e.target.value.length >= 2) {
                          debEditClient.current = setTimeout(async () => {
                            const res = await searchClients(businessId, e.target.value);
                            setEditClientSugg(res); setShowEditClientSugg(res.length > 0);
                          }, 250);
                        } else { setShowEditClientSugg(false); }
                      }}
                      onBlur={() => setTimeout(() => setShowEditClientSugg(false), 150)}
                      className="w-full px-2 py-1.5 rounded-lg bg-surface-input border border-surface-border text-content-primary text-sm mt-0.5" /></div>
                </div>
              ) : (
                <>
                  <p className="font-semibold text-content-primary">{order.client_name}</p>
                  {order.client_phone && <p className="text-sm text-content-secondary">{order.client_phone}</p>}
                </>
              )}
              {/* Assignation dans le mode édition */}
              {editing && editStaffList.length > 0 && (
                <div className="mt-2">
                  <label className="text-[10px] text-content-secondary">Technicien assigné</label>
                  <select value={editAssignedTo} onChange={e => setEditAssignedTo(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg bg-surface-input border border-surface-border text-content-primary text-sm mt-0.5">
                    <option value="">— Non assigné —</option>
                    {editStaffList.map(s => (
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
          {!order.client_name && editing && editStaffList.length > 0 && (
            <div className="rounded-xl bg-surface-hover p-3 space-y-1">
              <label className="text-[10px] text-content-secondary uppercase tracking-wider font-semibold flex items-center gap-1"><Wrench className="w-3 h-3" />Technicien assigné</label>
              <select value={editAssignedTo} onChange={e => setEditAssignedTo(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg bg-surface-input border border-surface-border text-content-primary text-sm">
                <option value="">— Non assigné —</option>
                {editStaffList.map(s => (
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
                            onMouseDown={() => { setEditLines(prev => [...prev, newLine({ service_id: item.id, name: item.name, price: String(item.price) })]); setEditCatalogSearch(''); setShowEditCatalogDrop(false); }}
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
                {editLines.map(line => (
                  <div key={line._id} className="flex gap-2 items-center">
                    <input value={line.name} onChange={e => updateEL(line._id, 'name', e.target.value)} placeholder="Prestation"
                      className="flex-1 px-2 py-1.5 rounded-lg bg-surface-input border border-surface-border text-content-primary text-sm" />
                    <input value={line.price} onChange={e => updateEL(line._id, 'price', e.target.value)} type="number" min={0} placeholder="Prix"
                      className="w-20 px-2 py-1.5 rounded-lg bg-surface-input border border-surface-border text-content-primary text-sm" />
                    <input value={line.quantity} onChange={e => updateEL(line._id, 'quantity', parseInt(e.target.value) || 1)} type="number" min={1}
                      className="w-12 px-2 py-1.5 rounded-lg bg-surface-input border border-surface-border text-content-primary text-sm text-center" />
                    <button onClick={() => setEditLines(prev => prev.length === 1 ? [newLine()] : prev.filter(l => l._id !== line._id))}
                      className="p-1.5 rounded-lg hover:bg-red-500/20 text-content-secondary hover:text-status-error"><Trash2 className="w-3.5 h-3.5" /></button>
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
              <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={2}
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
                  <button onClick={doCancel} disabled={busy}
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
    </>
  );
}

// ─── Catalog Modal ────────────────────────────────────────────────────────────

function CatalogModal({ businessId, item, onClose, onSaved }: {
  businessId: string; item?: ServiceCatalogItem; onClose: () => void; onSaved: () => void;
}) {
  const { error: notifError } = useNotificationStore();
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
    } catch (e: any) { notifError(toUserError(e)); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-surface-card rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-surface-border">
          <h3 className="font-bold text-content-primary">{item ? 'Modifier prestation' : 'Nouvelle prestation'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-hover text-content-secondary"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs text-content-secondary font-medium mb-1 block">Nom</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="ex: Lavage complet"
              className="w-full px-3 py-2 rounded-xl bg-surface-input border border-surface-border text-content-primary text-sm" />
          </div>
          <div>
            <label className="text-xs text-content-secondary font-medium mb-1 block">Catégorie</label>
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
              <label className="text-xs text-content-secondary font-medium mb-1 block">Prix</label>
              <input value={price} onChange={e => setPrice(e.target.value)} type="number" min={0} placeholder="0"
                className="w-full px-3 py-2 rounded-xl bg-surface-input border border-surface-border text-content-primary text-sm" />
            </div>
            <div>
              <label className="text-xs text-content-secondary font-medium mb-1 block">Durée (min)</label>
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

// ─── Subjects Tab ─────────────────────────────────────────────────────────────

type HistoryEntry =
  | { kind: 'subject'; subject: ServiceSubject; count: number }
  | { kind: 'client'; name: string; phone: string | null; count: number; lastDate: string };

function SubjectsTab({ businessId, currency }: { businessId: string; currency: string }) {
  const [subjects,  setSubjects]  = useState<ServiceSubject[]>([]);
  const [summary,   setSummary]   = useState<ServiceOrderSummary[]>([]);
  const [search,    setSearch]    = useState('');
  const [selected,  setSelected]  = useState<HistoryEntry | null>(null);
  const [history,   setHistory]   = useState<ServiceOrder[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getSubjects(businessId).catch(() => [] as ServiceSubject[]),
      getOrdersSummary(businessId).catch(() => [] as ServiceOrderSummary[]),
    ]).then(([s, o]) => {
      setSubjects(s);
      setSummary(o);
      setLoading(false);
    });
  }, [businessId]);

  useEffect(() => {
    if (!selected) { setHistory([]); return; }
    setHistLoading(true);
    const p = selected.kind === 'subject'
      ? getSubjectHistory(businessId, selected.subject.id)
      : getOrdersByClientName(businessId, selected.name);
    p.then(setHistory).catch(() => setHistory([])).finally(() => setHistLoading(false));
  }, [selected, businessId]);

  // Entrées unifiées : sujets + clients (ordres sans sujet groupés par client_name)
  const entries = useMemo<HistoryEntry[]>(() => {
    const subjectEntries: HistoryEntry[] = subjects.map(s => ({
      kind: 'subject',
      subject: s,
      count: summary.filter(o => o.subject_id === s.id).length,
    }));

    const clientMap = new Map<string, { name: string; phone: string | null; count: number; lastDate: string }>();
    for (const o of summary) {
      if (o.subject_id || !o.client_name) continue;
      const key = o.client_name.toLowerCase().trim();
      const existing = clientMap.get(key);
      if (!existing) {
        clientMap.set(key, { name: o.client_name, phone: o.client_phone ?? null, count: 1, lastDate: o.created_at });
      } else {
        existing.count++;
        if (o.created_at > existing.lastDate) existing.lastDate = o.created_at;
      }
    }
    const clientEntries: HistoryEntry[] = Array.from(clientMap.values()).map(v => ({
      kind: 'client' as const,
      name: v.name,
      phone: v.phone,
      count: v.count,
      lastDate: v.lastDate,
    }));

    return [...subjectEntries, ...clientEntries];
  }, [subjects, summary]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return entries;
    return entries.filter(e => {
      if (e.kind === 'subject') {
        return e.subject.reference.toLowerCase().includes(q) ||
               (e.subject.designation ?? '').toLowerCase().includes(q) ||
               e.subject.type_sujet.toLowerCase().includes(q);
      }
      return e.name.toLowerCase().includes(q) || (e.phone ?? '').includes(q);
    });
  }, [entries, search]);

  const selKey = selected
    ? selected.kind === 'subject' ? `s-${selected.subject.id}` : `c-${selected.name}`
    : null;

  return (
    <div className="flex gap-5 h-full">

      {/* ── Liste gauche ── */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-secondary" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher par référence, client…"
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-surface-input border border-surface-border text-content-primary text-sm" />
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-content-secondary">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />Chargement…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-content-secondary gap-2">
            <Package2 className="w-10 h-10 opacity-30" />
            <p className="text-sm">Aucun résultat</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-1.5">
            {/* Sujets (véhicules, appareils…) */}
            {filtered.some(e => e.kind === 'subject') && (
              <p className="text-xs font-bold text-content-secondary uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5" />Sujets suivis
              </p>
            )}
            {filtered.filter(e => e.kind === 'subject').map(e => {
              if (e.kind !== 'subject') return null;
              const key = `s-${e.subject.id}`;
              return (
                <button key={key} onClick={() => setSelected(selKey === key ? null : e)}
                  className={cn('w-full text-left rounded-xl border p-3 transition-colors',
                    selKey === key ? 'bg-brand-500/10 border-brand-500/30 text-content-brand' : 'border-surface-border hover:bg-surface-hover text-content-primary')}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <SubjectTypePill type={e.subject.type_sujet} />
                    <p className="font-mono font-bold text-sm flex-1 truncate">{e.subject.reference}</p>
                    <span className="text-xs text-content-secondary">{e.count} OT</span>
                  </div>
                  {e.subject.designation && <p className="text-xs text-content-secondary truncate">{e.subject.designation}</p>}
                </button>
              );
            })}

            {/* Clients (ordres sans sujet) */}
            {filtered.some(e => e.kind === 'client') && (
              <p className={cn('text-xs font-bold text-content-secondary uppercase tracking-widest mb-2 flex items-center gap-1.5',
                filtered.some(e => e.kind === 'subject') && 'mt-4')}>
                <User className="w-3.5 h-3.5" />Clients
              </p>
            )}
            {filtered.filter(e => e.kind === 'client').map(e => {
              if (e.kind !== 'client') return null;
              const key = `c-${e.name}`;
              return (
                <button key={key} onClick={() => setSelected(selKey === key ? null : e)}
                  className={cn('w-full text-left rounded-xl border p-3 transition-colors',
                    selKey === key ? 'bg-brand-500/10 border-brand-500/30 text-content-brand' : 'border-surface-border hover:bg-surface-hover text-content-primary')}>
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-content-secondary flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{e.name}</p>
                      {e.phone && <p className="text-xs text-content-secondary">{e.phone}</p>}
                    </div>
                    <span className="text-xs text-content-secondary flex-shrink-0">{e.count} OT</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Panneau historique droite ── */}
      {selected && (
        <div className="w-80 flex flex-col min-h-0 border-l border-surface-border pl-5">
          <div className="mb-4">
            {selected.kind === 'subject' ? (
              <>
                <div className="flex items-center gap-2 mb-1"><SubjectTypePill type={selected.subject.type_sujet} /></div>
                <h3 className="font-bold text-content-primary font-mono">{selected.subject.reference}</h3>
                {selected.subject.designation && <p className="text-sm text-content-secondary">{selected.subject.designation}</p>}
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-1"><User className="w-4 h-4 text-content-secondary" /></div>
                <h3 className="font-bold text-content-primary">{selected.name}</h3>
                {selected.phone && <p className="text-sm text-content-secondary">{selected.phone}</p>}
              </>
            )}
          </div>

          <p className="text-xs text-content-secondary font-semibold uppercase tracking-wider flex items-center gap-1.5 mb-3">
            <History className="w-3.5 h-3.5" />Historique
            {!histLoading && <span>({history.length})</span>}
          </p>

          {histLoading ? (
            <div className="flex items-center justify-center py-8 text-content-secondary">
              <RefreshCw className="w-4 h-4 animate-spin mr-2" />Chargement…
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-2">
              {history.length === 0 ? (
                <p className="text-content-secondary text-sm">Aucun historique</p>
              ) : history.map(o => (
                <div key={o.id} className="rounded-xl border border-surface-border p-3">
                  <div className="flex items-center justify-between mb-1">
                    <OTNumber n={o.order_number} />
                    <StatusBadge status={o.status} />
                  </div>
                  <p className="text-xs text-content-secondary">{new Date(o.created_at).toLocaleDateString('fr-FR')}</p>
                  <p className="text-sm font-semibold text-content-primary mt-1">{formatCurrency(o.total, currency)}</p>
                  {(o.items ?? []).slice(0, 3).map(i => (
                    <p key={i.id} className="text-xs text-content-secondary">· {i.name}</p>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type PageTab = 'orders' | 'catalog' | 'subjects';

export default function ServicesPage() {
  const { business, user } = useAuthStore();
  const can = useCan();
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
  const [page,         setPage]         = useState(1);
  const [totalCount,   setTotalCount]   = useState(0);
  const [counts,       setCounts]       = useState<Record<ServiceOrderStatus | 'all', number>>({
    all: 0, attente: 0, en_cours: 0, termine: 0, paye: 0, annule: 0,
  });
  const [showNewOT,    setShowNewOT]    = useState(false);
  const [selectedOrder,  setSelectedOrder]  = useState<ServiceOrder | null>(null);
  const [catalogModal, setCatalogModal] = useState<{ item?: ServiceCatalogItem } | null>(null);
  const [selectedCatalogCat, setSelectedCatalogCat] = useState<string | null | '__all__'>('__all__');
  const [newCatName, setNewCatName] = useState('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState('');
  const canViewServices = can('view_services');
  const canCreateOrder = can('create_service_order');
  const canUpdateStatus = can('update_service_status');
  const canCollectPayment = can('collect_service_payment');
  const canShareOrder = can('share_service_order');
  const canManageCatalog = can('manage_service_catalog');
  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  function deny() {
    notifError('Permission insuffisante');
  }

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
      const [ordersResult, orderCounts, c, ac, cats] = await Promise.all([
        getServiceOrders(businessId, {
          date: dateFilter || undefined,
          status: statusFilter,
          search: search || undefined,
          page,
          pageSize,
        }),
        getServiceOrderCounts(businessId, { date: dateFilter || undefined, search: search || undefined }),
        getServiceCatalog(businessId),
        getAllServiceCatalog(businessId),
        getServiceCategories(businessId).catch(() => [] as ServiceCategory[]),
      ]);
      setOrders(ordersResult.data);
      setTotalCount(ordersResult.count);
      setCounts(orderCounts);
      setCatalog(c); setAllCatalog(ac); setServiceCategories(cats);
    } catch (e: any) { notifError(toUserError(e)); }
    finally { setLoading(false); }
  }

  useEffect(() => { setPage(1); }, [businessId, dateFilter, statusFilter, search]);
  useEffect(() => { loadOrders(); }, [businessId, dateFilter, statusFilter, search, page]);

  async function quickTransition(id: string, status: ServiceOrderStatus, e: React.MouseEvent) {
    e.stopPropagation();
    if (!canUpdateStatus) { deny(); return; }
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

  async function deleteCatalogItem(id: string) {
    if (!canManageCatalog) { deny(); return; }
    if (!confirm('Supprimer cette prestation ?')) return;
    try { await deleteServiceCatalogItem(id); await loadOrders(); success('Prestation supprimée'); }
    catch (e: any) { notifError(toUserError(e)); }
  }

  async function toggleCatalog(id: string, active: boolean) {
    if (!canManageCatalog) { deny(); return; }
    try { await toggleServiceCatalogItem(id, active); await loadOrders(); }
    catch (e: any) { notifError(toUserError(e)); }
  }

  async function handleAddCategory() {
    if (!newCatName.trim()) return;
    try {
      await upsertServiceCategory(businessId, { name: newCatName.trim() });
      setNewCatName('');
      const cats = await getServiceCategories(businessId).catch(() => [] as ServiceCategory[]);
      setServiceCategories(cats);
    } catch (e: any) { notifError(toUserError(e)); }
  }

  async function handleDeleteCategory(id: string) {
    if (!confirm('Supprimer cette catégorie ? Les prestations liées ne seront pas supprimées.')) return;
    try {
      await deleteServiceCategory(id);
      if (selectedCatalogCat === id) setSelectedCatalogCat('__all__');
      const [cats, ac] = await Promise.all([
        getServiceCategories(businessId).catch(() => [] as ServiceCategory[]),
        getAllServiceCatalog(businessId),
      ]);
      setServiceCategories(cats);
      setAllCatalog(ac);
    } catch (e: any) { notifError(toUserError(e)); }
  }

  async function handleRenameCategory(id: string, name: string) {
    setEditingCatId(null);
    if (!name.trim()) return;
    const cat = serviceCategories.find(c => c.id === id);
    if (!cat || name.trim() === cat.name) return;
    try {
      await upsertServiceCategory(businessId, { id, name: name.trim(), color: cat.color, sort_order: cat.sort_order });
      const cats = await getServiceCategories(businessId).catch(() => [] as ServiceCategory[]);
      setServiceCategories(cats);
    } catch (e: any) { notifError(toUserError(e)); }
  }

  const filteredCatalogItems = useMemo(() => {
    if (selectedCatalogCat === '__all__') return allCatalog;
    if (selectedCatalogCat === null) return allCatalog.filter(i => !i.category_id);
    return allCatalog.filter(i => i.category_id === selectedCatalogCat);
  }, [allCatalog, selectedCatalogCat]);

  function handlePrintOrder(o: ServiceOrder, e: React.MouseEvent) {
    e.stopPropagation();
    if (!canShareOrder) { deny(); return; }
    if (!business) return;
    printHtml(generateServiceOrderReceipt({
      id: o.id, order_number: o.order_number, created_at: o.created_at,
      started_at: o.started_at, finished_at: o.finished_at, paid_at: o.paid_at,
      subject_ref: o.subject_ref,
      subject_info: o.subject_info ?? undefined,
      client_name: o.client_name, client_phone: o.client_phone,
      assigned_name: o.assigned_name,
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

  if (!canViewServices) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-base p-6">
        <div className="max-w-sm text-center">
          <Wrench className="mx-auto mb-3 h-10 w-10 text-content-secondary opacity-40" />
          <h1 className="text-lg font-bold text-content-primary">Acces refuse</h1>
          <p className="mt-1 text-sm text-content-secondary">Vous n'avez pas la permission d'ouvrir les prestations de service.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-surface-base">
      {/* Header */}
      <div className="flex flex-col gap-3 px-4 py-4 bg-surface-card border-b border-surface-border shrink-0 sm:flex-row sm:items-center sm:justify-between md:px-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-500/20 flex items-center justify-center">
            <Wrench className="w-5 h-5 text-content-brand" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-content-primary">Prestations de service</h1>
            <p className="text-xs text-content-secondary">{counts.all} ordre{counts.all !== 1 ? 's' : ''} de travail</p>
          </div>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          {canShareOrder && (
            <button onClick={copyPublicLink}
              className="flex flex-1 items-center justify-center gap-2 px-3 py-2 rounded-xl border border-surface-border text-content-secondary text-sm font-medium hover:bg-surface-hover sm:flex-none">
              <Share2 className="w-4 h-4" />Partager
            </button>
          )}
          {canCreateOrder && (
            <button onClick={() => setShowNewOT(true)}
              className="flex flex-1 items-center justify-center gap-2 px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold shadow-sm sm:flex-none">
              <Plus className="w-4 h-4" />Nouvel OT
            </button>
          )}
        </div>
      </div>
      {/* Tab bar */}
      <div className="flex items-center gap-1 overflow-x-auto px-4 py-2 bg-surface-card border-b border-surface-border shrink-0 md:px-6">
        {([
          { key: 'orders',   icon: Wrench,     label: 'Ordres de travail', desc: 'Créer & suivre les bons de prestation' },
          { key: 'catalog',  icon: Package2,   label: 'Catalogue',         desc: 'Prestations types & tarifs' },
          { key: 'subjects', icon: History,    label: 'Historique',        desc: 'Par véhicule, appareil ou client' },
        ] as const).map(({ key, icon: Icon, label, desc }) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn('flex items-start gap-2.5 px-4 py-2.5 rounded-xl text-left transition-colors min-w-0 flex-shrink-0', tab === key
              ? 'bg-brand-500/15 text-content-brand border border-brand-500/30'
              : 'text-content-secondary hover:text-content-primary hover:bg-surface-hover')}>
            <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold leading-tight">{label}</p>
              <p className="text-xs opacity-70 leading-tight mt-0.5 hidden sm:block">{desc}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {tab === 'orders' && (
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
                <button onClick={loadOrders} className="p-2 rounded-xl hover:bg-surface-hover text-content-secondary"><RefreshCw className="w-4 h-4" /></button>
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
              {loading ? (
                <div className="flex items-center justify-center h-40 text-content-secondary">
                  <RefreshCw className="w-5 h-5 animate-spin mr-2" />Chargement…
                </div>
              ) : orders.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-content-secondary gap-3">
                  <Wrench className="w-12 h-12 opacity-20" />
                  <p className="text-sm">Aucun ordre de travail</p>
                  {canCreateOrder && (
                  <button onClick={() => setShowNewOT(true)} className="text-xs text-content-brand hover:underline flex items-center gap-1">
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
                            <button onClick={e => { e.stopPropagation(); setSelectedOrder(order); }}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-status-success hover:bg-badge-success transition-colors">
                              <CreditCard className="w-3.5 h-3.5" />Encaisser
                            </button>
                          )}
                          {(order.status === 'paye' || order.status === 'annule') && (
                            <div className="flex-1" />
                          )}
                          {canShareOrder && (
                          <button onClick={e => handlePrintOrder(order, e)}
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
                            <tr key={order.id} onClick={() => setSelectedOrder(order)} className="cursor-pointer hover:bg-surface-hover/70">
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
                                    <button onClick={e => { e.stopPropagation(); setSelectedOrder(order); }}
                                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-status-success hover:bg-badge-success">
                                      <CreditCard className="h-3.5 w-3.5" />Encaisser
                                    </button>
                                  )}
                                  {canShareOrder && (
                                    <button onClick={e => handlePrintOrder(order, e)}
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

                <div className="flex flex-col gap-3 text-sm text-content-secondary sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    {totalCount === 0 ? '0 resultat' : `${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, totalCount)} sur ${totalCount}`}
                  </span>
                  <div className="flex items-center justify-between gap-2 sm:justify-end">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                      className="inline-flex items-center gap-1 rounded-lg border border-surface-border px-3 py-2 font-medium disabled:opacity-40">
                      <ChevronLeft className="h-4 w-4" />Precedent
                    </button>
                    <span className="min-w-20 text-center">Page {page} / {totalPages}</span>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                      className="inline-flex items-center gap-1 rounded-lg border border-surface-border px-3 py-2 font-medium disabled:opacity-40">
                      Suivant<ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                </>
              )}
            </div>
          </>
        )}

        {tab === 'catalog' && (
          <div className="flex-1 overflow-hidden p-6">
            <p className="text-xs text-content-secondary mb-4 flex items-center gap-1.5">
              <Package2 className="w-3.5 h-3.5 flex-shrink-0" />
              Définissez ici toutes vos prestations avec leur prix. Elles apparaîtront dans le formulaire de création d'un OT.
            </p>
            <div className="flex gap-5 h-[calc(100%-2rem)] max-w-4xl">

              {/* ── Colonne gauche : Catégories ──────────────────────── */}
              <div className="w-52 flex-shrink-0 flex flex-col border-r border-surface-border pr-5">
                <p className="text-xs font-bold text-content-secondary uppercase tracking-widest mb-3 flex items-center gap-2">
                  <LayoutGrid className="w-3.5 h-3.5" />Catégories
                </p>

                <div className="flex-1 overflow-y-auto space-y-0.5">
                  {/* Option "Toutes" */}
                  <button
                    onClick={() => setSelectedCatalogCat('__all__')}
                    className={cn('w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                      selectedCatalogCat === '__all__'
                        ? 'bg-brand-500/15 text-content-brand'
                        : 'text-content-secondary hover:bg-surface-hover hover:text-content-primary')}>
                    <span>Toutes</span>
                    <span className="text-xs opacity-70">{allCatalog.length}</span>
                  </button>

                  {/* Catégories dynamiques */}
                  {serviceCategories.map(cat => {
                    const count = allCatalog.filter(i => i.category_id === cat.id).length;
                    return (
                      <div key={cat.id}
                        onClick={() => editingCatId !== cat.id && setSelectedCatalogCat(cat.id)}
                        className={cn('group flex items-center gap-1 rounded-xl px-3 py-2.5 cursor-pointer transition-colors',
                          selectedCatalogCat === cat.id
                            ? 'bg-brand-500/15 text-content-brand'
                            : 'text-content-primary hover:bg-surface-hover')}>
                        {editingCatId === cat.id ? (
                          <input
                            autoFocus
                            className="flex-1 min-w-0 bg-transparent border-b border-brand-500 text-sm font-medium outline-none px-0 py-0"
                            value={editingCatName}
                            onChange={e => setEditingCatName(e.target.value)}
                            onBlur={() => handleRenameCategory(cat.id, editingCatName)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleRenameCategory(cat.id, editingCatName);
                              if (e.key === 'Escape') setEditingCatId(null);
                              e.stopPropagation();
                            }}
                            onClick={e => e.stopPropagation()}
                          />
                        ) : (
                          <span className="flex-1 text-sm font-medium truncate">{cat.name}</span>
                        )}
                        <span className="text-xs text-content-secondary opacity-70">{count}</span>
                        {canManageCatalog && editingCatId !== cat.id && (
                          <>
                            <button
                              onClick={e => { e.stopPropagation(); setEditingCatId(cat.id); setEditingCatName(cat.name); }}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-surface-hover text-content-secondary transition-all">
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); handleDeleteCategory(cat.id); }}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-red-500/20 hover:text-status-error text-content-secondary transition-all">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}

                  {/* Sans catégorie */}
                  {allCatalog.some(i => !i.category_id) && (
                    <button
                      onClick={() => setSelectedCatalogCat(null)}
                      className={cn('w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition-colors',
                        selectedCatalogCat === null
                          ? 'bg-brand-500/15 text-content-brand'
                          : 'text-content-secondary hover:bg-surface-hover hover:text-content-primary')}>
                      <span className="font-medium italic">Sans catégorie</span>
                      <span className="text-xs opacity-70">{allCatalog.filter(i => !i.category_id).length}</span>
                    </button>
                  )}
                </div>

                {/* Ajouter une catégorie */}
                {canManageCatalog && (
                  <div className="mt-3 pt-3 border-t border-surface-border">
                    <div className="flex gap-1.5">
                      <input
                        value={newCatName}
                        onChange={e => setNewCatName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
                        placeholder="Nouvelle catégorie…"
                        className="flex-1 min-w-0 px-2.5 py-2 text-xs rounded-xl bg-surface-hover border border-surface-border text-content-primary placeholder:text-content-secondary focus:outline-none focus:border-brand-500 transition-colors" />
                      <button
                        onClick={handleAddCategory}
                        disabled={!newCatName.trim()}
                        className="p-2 rounded-xl bg-brand-500/15 text-content-brand hover:bg-brand-500/25 disabled:opacity-40 transition-colors flex-shrink-0">
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Colonne droite : Prestations ─────────────────────── */}
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-content-primary">
                    {selectedCatalogCat === '__all__'
                      ? 'Toutes les prestations'
                      : selectedCatalogCat === null
                        ? 'Sans catégorie'
                        : (serviceCategories.find(c => c.id === selectedCatalogCat)?.name ?? 'Prestations')}
                    <span className="ml-2 text-xs font-normal text-content-secondary">({filteredCatalogItems.length})</span>
                  </h2>
                  {canManageCatalog && (
                    <button onClick={() => setCatalogModal({})}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl bg-brand-500/15 hover:bg-brand-500/25 text-content-brand text-sm font-medium">
                      <Plus className="w-4 h-4" />Nouvelle prestation
                    </button>
                  )}
                </div>

                {filteredCatalogItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center flex-1 text-content-secondary gap-3">
                    <Package2 className="w-12 h-12 opacity-20" />
                    <p className="text-sm">Aucune prestation ici</p>
                    {canManageCatalog && (
                      <button onClick={() => setCatalogModal({})} className="text-xs text-content-brand hover:underline">
                        Ajouter une prestation
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto space-y-1">
                    {filteredCatalogItems.map(item => (
                      <div key={item.id} className={cn('flex items-center gap-3 p-3 rounded-xl border transition-colors',
                        item.is_active ? 'bg-surface-card border-surface-border' : 'bg-surface-hover border-surface-border opacity-60')}>
                        <div className="flex-1 min-w-0">
                          <p className={cn('text-sm font-semibold', item.is_active ? 'text-content-primary' : 'text-content-secondary line-through')}>{item.name}</p>
                          {item.duration_min && <p className="text-xs text-content-secondary">{item.duration_min} min</p>}
                        </div>
                        <span className="font-bold text-content-primary text-sm whitespace-nowrap">{formatCurrency(item.price, currency)}</span>
                        {canManageCatalog && (
                          <div className="flex items-center gap-1">
                            <button onClick={() => toggleCatalog(item.id, !item.is_active)}
                              className={cn('p-1.5 rounded-lg transition-colors', item.is_active ? 'text-status-success hover:bg-badge-success' : 'text-content-secondary hover:bg-surface-hover')}>
                              {item.is_active ? <Check className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                            </button>
                            <button onClick={() => setCatalogModal({ item })} className="p-1.5 rounded-lg hover:bg-surface-hover text-content-secondary">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => deleteCatalogItem(item.id)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-content-secondary hover:text-status-error">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {tab === 'subjects' && (
          <div className="flex-1 overflow-hidden flex flex-col p-6">
            <p className="text-xs text-content-secondary mb-4 flex items-center gap-1.5 flex-shrink-0">
              <History className="w-3.5 h-3.5 flex-shrink-0" />
              Retrouvez l'historique complet des OT par véhicule, appareil ou client. Cliquez sur une entrée pour voir tous ses ordres passés.
            </p>
            <div className="flex-1 overflow-hidden">
              <SubjectsTab businessId={businessId} currency={currency} />
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showNewOT && canCreateOrder && (
        <NewOTModal businessId={businessId} catalog={catalog} onClose={() => setShowNewOT(false)}
          onCreated={order => { setShowNewOT(false); setOrders(prev => [{ ...order, items: order.items ?? [] }, ...prev]); success('Ordre de travail créé'); }} />
      )}

      {selectedOrder && (
        <OrderDetailPanel order={selectedOrder} currency={currency} catalog={catalog}
          businessId={businessId} onClose={() => setSelectedOrder(null)} onRefresh={() => { loadOrders(); setSelectedOrder(null); }} />
      )}

      {catalogModal !== null && canManageCatalog && (
        <CatalogModal businessId={businessId} item={catalogModal.item} onClose={() => setCatalogModal(null)}
          onSaved={() => { setCatalogModal(null); loadOrders(); success('Catalogue mis à jour'); }} />
      )}


    </div>
  );
}
