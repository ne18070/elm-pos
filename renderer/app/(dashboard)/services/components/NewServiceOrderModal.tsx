import React, { useEffect, useState } from 'react';
import { X, Wrench, ChevronUp, ChevronDown, User, Phone, Search, Plus, Trash2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { cn, formatCurrency } from '@/lib/utils';
import { toUserError } from '@/lib/user-error';
import {
  createServiceOrder,
  type ServiceOrder,
  type ServiceCatalogItem,
} from '@services/supabase/service-orders';
import { getStaff, type Staff } from '@services/supabase/staff';
import { useServiceOrderForm } from '../hooks/useServiceOrderForm';
import { SUBJECT_TYPES, subjectTypeCfg } from '../constants';
import { StatusBadge, OTNumber } from './StatusBadge';

function SubjectTypePill({ type }: { type: string | null | undefined }) {
  const cfg = subjectTypeCfg(type);
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface-hover text-content-secondary border border-surface-border">
      {cfg.label}
    </span>
  );
}

export function NewServiceOrderModal({
  businessId, catalog, onClose, onCreated,
}: {
  businessId: string;
  catalog: ServiceCatalogItem[];
  onClose: () => void;
  onCreated: (o: ServiceOrder) => void;
}) {
  const { user } = useAuthStore();
  const { error: notifError } = useNotificationStore();
  const [saving, setSaving] = useState(false);
  const [showSubject, setShowSubject] = useState(true);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [showCatalogDrop, setShowCatalogDrop] = useState(false);

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
    total,
    validate,
  } = useServiceOrderForm({}, businessId);

  useEffect(() => {
    getStaff(businessId).then(setStaffList).catch(() => {});
  }, [businessId]);

  const typeCfg = subjectTypeCfg(formData.subjectType);

  async function handleSubmit() {
    const { isValid, errors, validLines } = validate();
    if (!isValid) {
      if (errors.lines) notifError(errors.lines);
      return;
    }

    setSaving(true);
    try {
      const order = await createServiceOrder({
        businessId,
        subjectRef: formData.subjectRef.trim() || undefined,
        subjectType: formData.subjectRef.trim() ? formData.subjectType : undefined,
        subjectInfo: formData.subjectInfo.trim() || undefined,
        clientName:  formData.clientName.trim() || undefined,
        clientPhone: formData.clientPhone.trim() || undefined,
        assignedTo:  formData.assignedTo || undefined,
        assignedName: staffList.find(s => s.id === formData.assignedTo)?.name || undefined,
        notes:       formData.notes.trim() || undefined,
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
                      <button key={t.value} onClick={() => updateField('subjectType', t.value)}
                        className={cn('px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors', formData.subjectType === t.value
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
                    value={formData.subjectRef}
                    onChange={e => handleRefChange(e.target.value)}
                    onBlur={() => setTimeout(() => setShowSugg(false), 200)}
                    placeholder={`ex: ${formData.subjectType === 'vehicule' ? 'AA-1234-DK' : formData.subjectType === 'billet' ? 'AF123-DKR-CDG' : formData.subjectType === 'appareil' ? 'SN123456789' : 'Identifiant…'}`}
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
                  <input value={formData.subjectInfo} onChange={e => updateField('subjectInfo', e.target.value)}
                    placeholder={formData.subjectType === 'vehicule' ? 'ex: Toyota Corolla blanche' : formData.subjectType === 'billet' ? 'ex: Air Sénégal DKR → CDG' : formData.subjectType === 'appareil' ? 'ex: iPhone 14 Pro noir' : 'Description…'}
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
                value={formData.clientName}
                onChange={e => handleClientSearch(e.target.value, 'clientName')}
                onFocus={() => formData.clientName.length >= 2 && setShowClientSugg(clientSugg.length > 0)}
                onBlur={() => setTimeout(() => setShowClientSugg(false), 150)}
                placeholder="Nom du client"
                className="w-full px-3 py-2 rounded-lg bg-surface-input border border-surface-border text-content-primary placeholder-content-muted text-sm" />
            </div>
            <div>
              <label className="text-xs text-content-secondary font-medium mb-1 block flex items-center gap-1"><Phone className="w-3 h-3" />Téléphone</label>
              <input
                value={formData.clientPhone}
                onChange={e => handleClientSearch(e.target.value, 'clientPhone')}
                onFocus={() => formData.clientPhone.length >= 2 && setShowClientSugg(clientSugg.length > 0)}
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
                value={formData.assignedTo}
                onChange={e => updateField('assignedTo', e.target.value)}
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
              {formData.lines.map(line => (
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
            <button onClick={() => addLine()}
              className="mt-2 text-xs text-content-brand hover:text-brand-400 flex items-center gap-1 font-medium">
              <Plus className="w-3.5 h-3.5" />Ajouter une ligne
            </button>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-content-secondary font-medium mb-1 block">Notes internes</label>
            <textarea value={formData.notes} onChange={e => updateField('notes', e.target.value)} rows={2} placeholder="Observations, remarques…"
              className="w-full px-3 py-2 rounded-lg bg-surface-input border border-surface-border text-content-primary placeholder-content-muted text-sm resize-none" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-surface-border bg-surface-card sticky bottom-0">
          <div className="text-content-primary font-bold text-lg">Total : {formatCurrency(total)}</div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-xl border border-surface-border text-content-secondary hover:bg-surface-hover text-sm font-medium">Annuler</button>
            <button onClick={handleSubmit} disabled={saving || formData.lines.every(l => !l.name.trim())}
              className="px-5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold disabled:opacity-40">
              {saving ? 'Création…' : "Créer l'OT"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
