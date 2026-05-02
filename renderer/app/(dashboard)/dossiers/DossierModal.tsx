import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Search, Plus, Loader2, Check, UserCircle2, GitBranch, ShieldCheck } from 'lucide-react';
import { useNotificationStore } from '@/store/notifications';
import { useCan } from '@/hooks/usePermission';
import { supabase } from '@/lib/supabase';
import { toUserError } from '@/lib/user-error';
import { getReferenceData, upsertRefItem, type RefItem } from '@services/supabase/reference-data';
import { getClients, type Client } from '@services/supabase/clients';
import { 
  getInstancesByDossier, getWorkflows, 
} from '@services/supabase/workflows';
import { triggerWorkflow } from '@/lib/workflow-runtime';
import { 
  createDossier, updateDossier, generateDossierReference, 
  type Dossier 
} from '@services/supabase/dossiers';
import type { WorkflowInstance, Workflow } from '@pos-types';

// --- Sub-Modals -------------------------------------------------------------

function QuickClientModal({ businessId, onClose, onCreated }: { businessId: string; onClose: () => void; onCreated: (c: any) => void; }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', type: 'personne_physique', identification_number: '' });
  const [saving, setSaving] = useState(false);
  const { error: notifError, success } = useNotificationStore();

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).from('clients').insert({
        business_id: businessId,
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        type: form.type,
        identification_number: form.identification_number.trim() || null,
      }).select().single();
      if (error) throw error;
      success('Client créé');
      onCreated(data);
    } catch (e) { notifError(toUserError(e)); }
    finally { setSaving(false); }
  }

  const isMoral = form.type === 'personne_morale';

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4 backdrop-blur-md">
      <div className="bg-surface border border-surface-border rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-surface-border flex items-center justify-between bg-surface-card/30">
          <h3 className="text-lg font-black text-content-primary tracking-tight uppercase">Nouveau Client</h3>
          <button onClick={onClose} className="p-2 hover:bg-surface-card rounded-xl text-content-muted transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label-sm">Type</label>
              <select className="input h-11" value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                <option value="personne_physique">Particulier</option>
                <option value="personne_morale">Entreprise</option>
              </select>
            </div>
            <div><label className="label-sm">{isMoral ? 'RCCM / NINEA' : 'CNI / Passeport'}</label><input className="input h-11 font-mono" value={form.identification_number} onChange={e => setForm({...form, identification_number: e.target.value})} placeholder="ID..." /></div>
          </div>

          <div><label className="label-sm">Nom complet / Raison sociale</label><input autoFocus className="input h-11" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Ex: Jean Dupont" /></div>
          
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label-sm">Téléphone</label><input className="input h-11" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="+221..." /></div>
            <div><label className="label-sm">Email</label><input className="input h-11" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="client@exemple.com" /></div>
          </div>
          
          <div className="flex gap-3 pt-4">
            <button onClick={onClose} className="btn-secondary flex-1 h-11 font-black uppercase text-[10px] tracking-widest">Annuler</button>
            <button onClick={handleSave} disabled={saving || !form.name.trim()} className="btn-primary flex-1 h-11 font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Créer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickRefModal({ 
  businessId, category, label, onClose, onCreated 
}: { 
  businessId: string; category: string; label: string; onClose: () => void; onCreated: (item: RefItem) => void; 
}) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const { error: notifError, success } = useNotificationStore();

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const value = name.trim().toLowerCase().replace(/\s+/g, '_');
      const item = await upsertRefItem(category as any, {
        business_id: businessId,
        label: name.trim(),
        value,
        is_active: true,
        sort_order: 0,
        color: null,
        metadata: {},
      });
      success(`${label} ajouté`);
      onCreated(item as unknown as RefItem);
    } catch (e) { notifError(toUserError(e)); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4 backdrop-blur-md">
      <div className="bg-surface border border-surface-border rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-5 border-b border-surface-border flex items-center justify-between bg-surface-card/30">
          <h3 className="text-sm font-black text-content-primary tracking-tight uppercase">Ajouter : {label}</h3>
          <button onClick={onClose} className="p-2 hover:bg-surface-card rounded-xl text-content-muted"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase text-content-muted mb-1.5 block">Nom / Libellé</label>
            <input autoFocus className="input h-12" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: TGI de Dakar" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="btn-secondary flex-1 h-11 text-[10px] font-black uppercase tracking-widest">Annuler</button>
            <button onClick={handleSave} disabled={saving || !name.trim()} className="btn-primary flex-1 h-11 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Créer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Main Modal -------------------------------------------------------------

export function DossierModal({
  initial, businessId,
  typesAffaire, tribunaux, statuts,
  onClose, onSaved,
}: {
  initial:      Dossier | null;
  businessId:   string;
  typesAffaire: RefItem[];
  tribunaux:    RefItem[];
  statuts:      RefItem[];
  onClose:      () => void;
  onSaved:      (dossier: Dossier) => void;
}) {
  const { error: notifError, success } = useNotificationStore();
  const can = useCan();
  const [showQuickClient, setShowQuickClient] = useState(false);
  const [quickRef, setQuickRef] = useState<{ category: string; label: string } | null>(null);
  const [localTypesAffaire, setLocalTypesAffaire] = useState(typesAffaire);
  const [localTribunaux, setLocalTribunaux] = useState(tribunaux);

  const [form, setForm] = useState({
    reference:      initial?.reference      ?? '',
    type_affaire:   initial?.type_affaire   ?? (typesAffaire[0]?.value ?? ''),
    client_name:    initial?.client_name    ?? '',
    client_type:    '', 
    client_id_num:  '', 
    client_rep:     '',
    client_phone:   initial?.client_phone   ?? '',
    client_email:   initial?.client_email   ?? '',
    adversaire:     initial?.adversaire     ?? '',
    tribunal:       initial?.tribunal       ?? '',
    juge:           initial?.juge           ?? '',
    status:         initial?.status         ?? (statuts[0]?.value ?? 'ouvert'),
    description:    initial?.description    ?? '',
    date_ouverture: initial?.date_ouverture ?? new Date().toISOString().slice(0, 10),
    date_audience:  initial?.date_audience  ?? '',
    selectedWorkflow: '',
  });
  
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [instances, setInstances] = useState<WorkflowInstance[]>([]);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [typesClient, setTypesClient] = useState<RefItem[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [showClientResults, setShowClientResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const refreshRefData = useCallback(async (cat: string) => {
    const data = await getReferenceData(cat as any, businessId);
    if (cat === 'type_affaire') setLocalTypesAffaire(data);
    if (cat === 'tribunal') setLocalTribunaux(data);
    if (cat === 'type_client') setTypesClient(data);
  }, [businessId]);
  
  useEffect(() => {
    getClients(businessId).then(setAllClients).catch(() => {});
    getReferenceData('type_client', businessId).then(setTypesClient).catch(() => {});
    getWorkflows(businessId, true).then(setWorkflows).catch(() => {});
    if (initial) {
      getInstancesByDossier(initial.id).then(setInstances).catch(() => {});
    } else {
      // Auto-generate ref for new dossier
      generateDossierReference(businessId).then(ref => setForm(f => ({ ...f, reference: ref })));
    }
  }, [initial, businessId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowClientResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredClients = allClients.filter(c => 
    c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
    (c.phone && c.phone.includes(clientSearch))
  ).slice(0, 5);

  const selectClient = (c: any) => {
    setForm(p => ({
      ...p,
      client_name: c.name,
      client_type: c.type ?? '',
      client_id_num: c.identification_number ?? '',
      client_rep: c.representative_name ?? '',
      client_phone: c.phone ?? '',
      client_email: c.email ?? '',
    }));
    setClientSearch(c.name);
    setShowClientResults(false);
  };

  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  async function handleSave() {
    if (!form.client_name.trim()) { notifError('Le nom du client est requis'); return; }
    if (!form.reference.trim())   { notifError('La référence est requise'); return; }
    setSaving(true);
    try {
      const payload = {
        reference:      form.reference.trim(),
        type_affaire:   form.type_affaire,
        client_name:    form.client_name.trim(),
        client_phone:   form.client_phone.trim()  || null,
        client_email:   form.client_email.trim()  || null,
        adversaire:     form.adversaire.trim()    || null,
        tribunal:       form.tribunal             || null,
        juge:           form.juge.trim()          || null,
        status:         form.status,
        description:    form.description.trim()   || null,
        date_ouverture: form.date_ouverture,
        date_audience:  form.date_audience        || null,
      };
      
      let saved: Dossier;
      if (initial) {
        saved = await updateDossier(businessId, initial.id, payload);
      } else {
        saved = await createDossier(businessId, payload);

        if (form.selectedWorkflow && can('launch_workflow')) {
          await triggerWorkflow({
            workflow_id: form.selectedWorkflow,
            dossier_id:  saved.id,
            triggered_by: 'AUTO_ON_CREATE',
            initial_context: {
              dossier_id:    saved.id,
              reference:     saved.reference,
              client_name:   saved.client_name,
              client_type:   form.client_type,
              client_id_num: form.client_id_num,
              client_rep:    form.client_rep,
              client_phone:  saved.client_phone,
              client_email:  saved.client_email,
            }
          });
        }
      }
      success(initial ? 'Mis à jour' : 'Créé');
      onSaved(saved);
    } catch (e) { notifError(toUserError(e)); }
    finally { setSaving(false); }
  }

  const isMoral = form.client_type === 'personne_morale' || form.client_type === 'association';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-surface-card rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-5 border-b border-surface-border shrink-0">
          <h2 className="text-content-primary font-bold">{initial ? `Modifier — ${initial.reference}` : 'Nouveau dossier'}</h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-surface-card text-content-secondary transition-all"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto p-5 space-y-5 scrollbar-thin">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Référence Dossier</label><input className="input" value={form.reference} onChange={(e) => set('reference', e.target.value)} /></div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="label mb-0">Type d'affaire</label>
                <button type="button" onClick={() => setQuickRef({ category: 'type_affaire', label: 'Type d\'affaire' })} className="text-[9px] font-black uppercase text-content-brand hover:text-content-brand transition-all flex items-center gap-1"><Plus className="w-2.5 h-2.5" /> Nouveau</button>
              </div>
              <select className="input" value={form.type_affaire} onChange={(e) => set('type_affaire', e.target.value)}>
                {localTypesAffaire.map((t) => <option key={t.value} value={t.value} className="bg-surface-card text-content-primary">{t.label}</option>)}
              </select>
            </div>
          </div>

          <div className="p-5 bg-surface/30 border border-surface-border rounded-2xl space-y-4">
            <div className="flex items-center gap-2 text-content-brand mb-1">
              <UserCircle2 className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-widest text-content-secondary">Entité Juridique (Client)</span>
            </div>

            <div className="relative" ref={searchRef}>
              <div className="flex items-center justify-between mb-1.5">
                <label className="label mb-0">Nom de l'entité / Client <span className="text-status-error">*</span></label>
                <button 
                  type="button" 
                  onClick={() => setShowQuickClient(true)}
                  className="text-[10px] font-black uppercase tracking-widest text-content-brand hover:text-content-brand flex items-center gap-1 transition-all"
                >
                  <Plus className="w-3 h-3" /> Nouveau Client
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
                <input className="input pl-10 h-11" value={form.client_name || clientSearch} onChange={(e) => { set('client_name', e.target.value); setClientSearch(e.target.value); setShowClientResults(true); }} onFocus={() => setShowClientResults(true)} placeholder="Rechercher ou saisir..." />
              </div>
              {showClientResults && clientSearch.length > 0 && filteredClients.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-surface border border-surface-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                  {filteredClients.map(c => (
                    <button key={c.id} onClick={() => selectClient(c)} className="w-full text-left px-4 py-3 hover:bg-surface-card border-b border-surface-border last:border-0 flex items-center justify-between">
                      <div><p className="text-sm text-content-primary font-bold">{c.name}</p><p className="text-[10px] text-content-muted">{c.phone || c.email || '—'}</p></div>
                      <Plus className="w-3.5 h-3.5 text-content-brand" />
                    </button>
                  ))}
                </div>
              )}
            </div>


            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="label mb-0">Type d'entité</label>
                  <button type="button" onClick={() => setQuickRef({ category: 'type_client', label: 'Type d\'entité' })} className="text-[9px] font-black uppercase text-content-brand hover:text-content-brand transition-all flex items-center gap-1"><Plus className="w-2.5 h-2.5" /> Nouveau</button>
                </div>
                <select className="input" value={form.client_type} onChange={(e) => set('client_type', e.target.value)}>
                  <option value="">— Sélectionner —</option>
                  {typesClient.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">{isMoral ? 'Identification (RCCM/NINEA)' : 'CNI / Passeport'}</label>
                <input className="input" value={form.client_id_num} onChange={(e) => set('client_id_num', e.target.value)} placeholder="..." />
              </div>
            </div>

            {isMoral && (
              <div>
                <label className="label">Représentant légal</label>
                <input className="input" value={form.client_rep} onChange={(e) => set('client_rep', e.target.value)} placeholder="Prénom Nom du signataire" />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Téléphone</label><input className="input" value={form.client_phone} onChange={(e) => set('client_phone', e.target.value)} /></div>
              <div><label className="label">Email</label><input className="input" value={form.client_email} onChange={(e) => set('client_email', e.target.value)} /></div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Adversaire</label><input className="input" value={form.adversaire} onChange={(e) => set('adversaire', e.target.value)} /></div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="label mb-0">Tribunal / Juridiction</label>
                <button type="button" onClick={() => setQuickRef({ category: 'tribunal', label: 'Tribunal' })} className="text-[9px] font-black uppercase text-content-brand hover:text-content-brand transition-all flex items-center gap-1"><Plus className="w-2.5 h-2.5" /> Nouveau</button>
              </div>
              <select className="input" value={form.tribunal || ''} onChange={(e) => set('tribunal', e.target.value)}>
                <option value="">— Sélectionner —</option>
                {localTribunaux.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Date d'ouverture</label><input type="date" className="input" value={form.date_ouverture} onChange={(e) => set('date_ouverture', e.target.value)} /></div>
            <div><label className="label">Prochaine audience</label><input type="date" className="input" value={form.date_audience} onChange={(e) => set('date_audience', e.target.value)} /></div>
          </div>
          
          {initial ? (
            <div className="p-4 bg-surface/50 border border-surface-border rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-content-secondary">
                <ShieldCheck className="w-4 h-4 text-status-success" />
                <span className="text-[10px] font-black uppercase tracking-widest">Processus Verrouillé (Audit)</span>
              </div>
              <p className="text-sm font-bold text-content-primary italic">
                {workflows.find(w => (instances ?? []).some(i => i.workflow_id === w.id))?.name || "Processus actif"}
              </p>
              <p className="text-[10px] text-content-muted leading-tight">
                Pour garantir l'intégrité de l'audit juridique, le modèle de procédure ne peut plus être modifié une fois lancé.
              </p>
            </div>
          ) : workflows.length > 0 && (
            <div className="p-4 bg-brand-500/5 border border-brand-500/20 rounded-2xl space-y-3">
              <div className="flex items-center gap-2 text-content-brand"><GitBranch className="w-4 h-4" /><span className="text-xs font-bold uppercase">Automatisation</span></div>
              <select className="input bg-surface" value={form.selectedWorkflow} onChange={(e) => set('selectedWorkflow', e.target.value)}>
                <option value="">— Aucun processus au démarrage —</option>
                {workflows.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          )}
          
          <div><label className="label">Notes / Faits</label><textarea className="input resize-none" rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} /></div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-surface-border shrink-0">
          <button onClick={onClose} className="btn-secondary text-sm px-6">Annuler</button>
          <button onClick={handleSave} disabled={saving || !form.client_name.trim()} className="btn-primary text-sm px-8 flex items-center gap-2 font-bold shadow-glow"><Check className="w-4 h-4" />{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </div>

      {showQuickClient && (
        <QuickClientModal 
          businessId={businessId} 
          onClose={() => setShowQuickClient(false)} 
          onCreated={(newClient) => {
            setShowQuickClient(false);
            getClients(businessId).then(setAllClients);
            selectClient(newClient);
          }}
        />
      )}

      {quickRef && (
        <QuickRefModal
          businessId={businessId}
          category={quickRef.category}
          label={quickRef.label}
          onClose={() => setQuickRef(null)}
          onCreated={(newItem) => {
            setQuickRef(null);
            refreshRefData(quickRef.category);
            set(quickRef.category === 'type_affaire' ? 'type_affaire' : quickRef.category === 'tribunal' ? 'tribunal' : 'client_type', newItem.value);
          }}
        />
      )}
    </div>
  );
}
