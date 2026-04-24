'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  Plus, Briefcase, Search, Loader2, X, Check, Pencil, Trash2, 
  Phone, Scale, Calendar, Paperclip, Upload, ExternalLink, 
  HardDrive, AlertTriangle, GitBranch, Play, ChevronLeft, ChevronRight, 
  ChevronDown, PauseCircle, XCircle, CheckCircle2, Clock, Mail,
  Activity, BookOpen, Settings2, Building2, UserCircle2, ToggleLeft, ToggleRight,
  ShieldCheck, Receipt, TrendingUp, AlertCircle, Archive, ArchiveRestore,
  Download, History
} from 'lucide-react';

import { toUserError } from '@/lib/user-error';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { useCan } from '@/hooks/usePermission';
import { supabase } from '@/lib/supabase';
import { canDelete } from '@/lib/permissions';
import { displayCurrency } from '@/lib/utils';

import { SideDrawer } from '@/components/ui/SideDrawer';
import { MonitoringDashboard } from '@/components/workflow/MonitoringDashboard';
import { WorkflowBuilder } from '@/components/workflow/WorkflowBuilder';
import { PretentionsLibrary } from '@/components/workflow/PretentionsLibrary';
import { WorkflowRunner } from '@/components/workflow/WorkflowRunner';

import { getReferenceData, upsertRefItem, deleteRefItem, type RefItem } from '@services/supabase/reference-data';
import { getClients, type Client } from '@services/supabase/clients';
import {
  getFichiers, uploadFichier, deleteFichier, getSignedUrl, getStorageInfo,
  formatBytes, getFileIcon,
  type DossierFichier, type StorageInfo,
} from '@services/supabase/dossier-fichiers';
import { 
  getInstancesByDossier, getWorkflows, deleteWorkflow, toggleWorkflowStatus, 
  createTrackingToken, saveWorkflow, getWorkflowVersions, type WorkflowVersion 
} from '@services/supabase/workflows';
import { triggerWorkflow } from '@/lib/workflow-runtime';
import { logAction } from '@services/supabase/logger';

import type { WorkflowInstance, Workflow, WorkflowStatus } from '@pos-types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Dossier {
  id:             string;
  reference:      string;
  type_affaire:   string;
  client_name:    string;
  client_phone:   string | null;
  client_email:   string | null;
  adversaire:     string | null;
  tribunal:       string | null;
  juge:           string | null;
  status:         string;
  description:    string | null;
  date_ouverture: string;
  date_audience:  string | null;
  created_at:     string;
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function genRef(count: number) {
  return `DOS-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`;
}

function StatusBadge({ status, statuts }: { status: string; statuts: RefItem[] }) {
  const s = statuts.find((x) => x.value === status);
  const cls = (s?.metadata?.cls as string) ?? 'bg-surface-card text-content-secondary border-surface-border';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${cls}`}>
      {s?.label ?? status}
    </span>
  );
}

// ─── Onglet Configuration ───────────────────────────────────────────────────

function ConfigTab({ businessId, onRefresh }: { businessId: string, onRefresh: () => void }) {
  const [category, setCategory] = useState<'type_affaire' | 'tribunal' | 'statut_dossier' | 'type_client'>('type_affaire');
  const [items, setItems] = useState<RefItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<RefItem> | null>(null);
  const { error: notifError, success } = useNotificationStore();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getReferenceData(category, businessId);
      setItems(data);
    } catch (e) { notifError(String(e)); }
    finally { setLoading(false); }
  }, [category, businessId, notifError]);

  useEffect(() => { load(); }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editing?.label || !editing?.value) return;
    try {
      await upsertRefItem(category, {
        label:       editing.label!,
        value:       editing.value!,
        business_id: businessId,
        is_active:   true,
        sort_order:  editing.sort_order ?? 0,
        color:       editing.color ?? null,
        metadata:    editing.metadata ?? {},
      });
      success('Enregistré');
      setEditing(null);
      load();
      onRefresh();
    } catch (e) { notifError(String(e)); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer cet élément ?')) return;
    try {
      await deleteRefItem(id);
      success('Supprimé');
      load();
      onRefresh();
    } catch (e) { notifError(String(e)); }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex gap-1 p-1 bg-surface/50 border border-surface-border rounded-xl w-fit">
        {[
          { id: 'type_affaire',   label: 'Types d\'affaire' },
          { id: 'tribunal',       label: 'Tribunaux' },
          { id: 'statut_dossier', label: 'Statuts' },
          { id: 'type_client',    label: 'Types de client' },
        ].map(c => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id as any)}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${category === c.id ? 'bg-brand-600 text-content-primary shadow-lg' : 'text-content-muted hover:text-content-primary'}`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-content-muted" /></div>
          ) : items.length === 0 ? (
            <div className="card p-12 text-center text-content-muted italic">Aucun élément configuré</div>
          ) : (
            <div className="grid gap-2">
              {items.map(item => (
                <div key={item.id} className="card p-4 flex items-center justify-between group bg-surface/30">
                  <div>
                    <p className="font-bold text-content-primary text-sm">{item.label}</p>
                    <p className="text-[10px] text-content-muted font-mono mt-0.5">{item.value}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setEditing(item)} className="p-2 rounded-lg hover:bg-surface-card text-content-secondary hover:text-content-primary"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(item.id)} className="p-2 rounded-lg hover:bg-badge-error text-content-secondary hover:text-status-error"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5 space-y-4 h-fit sticky top-6">
          <h3 className="font-bold text-content-primary text-sm flex items-center gap-2 border-b border-surface-border pb-3">
            {editing?.id ? <Pencil className="w-4 h-4 text-status-info" /> : <Plus className="w-4 h-4 text-status-success" />}
            {editing?.id ? 'Modifier' : 'Ajouter un élément'}
          </h3>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="text-[10px] uppercase font-black text-content-muted mb-1.5 block">Nom (Libellé)</label>
              <input className="input text-sm bg-surface-overlay" value={editing?.label ?? ''} onChange={e => setEditing(p => ({ ...p, label: e.target.value }))} placeholder="Ex: Tribunal de Grande Instance" required />
            </div>
            <div>
              <label className="text-[10px] uppercase font-black text-content-muted mb-1.5 block">Code (Clé unique)</label>
              <input className="input text-sm bg-surface-overlay font-mono" value={editing?.value ?? ''} onChange={e => setEditing(p => ({ ...p, value: e.target.value.toLowerCase().replace(/\s+/g, '_') }))} placeholder="ex: tgi_dakar" required disabled={!!editing?.id} />
            </div>
            <div className="flex gap-2 pt-2">
              <button type="submit" className="flex-1 bg-brand-500 hover:bg-brand-600 text-content-primary font-bold py-2 rounded-xl text-xs transition-all">{editing?.id ? 'Mettre à jour' : 'Ajouter à la liste'}</button>
              {editing && <button type="button" onClick={() => setEditing(null)} className="px-4 bg-surface-card hover:bg-surface-input text-content-primary rounded-xl text-xs">Annuler</button>}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Modaux ──────────────────────────────────────────────────────────────────

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

// ─── Modal Dossier ───────────────────────────────────────────────────────────

function DossierModal({
  initial, count, businessId,
  typesAffaire, tribunaux, statuts,
  onClose, onSaved,
}: {
  initial:      Dossier | null;
  count:        number;
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
    reference:      initial?.reference      ?? genRef(count),
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
        business_id:    businessId,
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
        updated_at:     new Date().toISOString(),
      };
      
      let saved: Dossier;
      if (initial) {
        const { data, error } = await supabase.from('dossiers' as any).update(payload).eq('id', initial.id).select().single();
        if (error) throw error;
        saved = data as unknown as Dossier;
        logAction({ business_id: businessId, action: 'dossier.updated', entity_type: 'dossier', entity_id: saved.id, metadata: { reference: saved.reference, client_name: saved.client_name } });
      } else {
        const { data, error } = await supabase.from('dossiers' as any).insert(payload).select().single();
        if (error) throw error;
        saved = data as unknown as Dossier;
        logAction({ business_id: businessId, action: 'dossier.created', entity_type: 'dossier', entity_id: saved.id, metadata: { reference: saved.reference, client_name: saved.client_name } });

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
                {localTypesAffaire.map((t) => <option key={t.value} value={t.value} className="bg-gray-900 text-content-primary">{t.label}</option>)}
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

// ─── Panneaux Processus & Fichiers ───────────────────────────────────────────

// ─── Panneaux Processus & Fichiers & Finances ────────────────────────────────

interface HonoraireLine {
  id:              string;
  dossier_id:      string | null;
  client_name:     string;
  type_prestation: string;
  description:     string | null;
  montant:         number;
  montant_paye:    number;
  status:          string;
  date_facture:    string;
}

function FinancesPanel({ dossier, businessId, onClose, canEdit }: { dossier: Dossier; businessId: string; onClose: () => void; canEdit: boolean; }) {
  const [lines, setLines] = useState<HonoraireLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const { success, error: notifError } = useNotificationStore();

  const [form, setForm] = useState({
    type_prestation: 'provision',
    montant: '',
    description: '',
    date_facture: new Date().toISOString().slice(0, 10),
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).from('honoraires_cabinet')
        .select('*')
        .eq('dossier_id', dossier.id)
        .order('date_facture', { ascending: false });
      if (error) throw error;
      setLines(data || []);
    } catch (e) { notifError(String(e)); }
    finally { setLoading(false); }
  }, [dossier.id, notifError]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e: React.FormEvent) {
    if (!canEdit) return;
    e.preventDefault();
    const m = parseFloat(form.montant) || 0;
    if (m <= 0) return;
    setSaving(true);
    try {
      const payload = {
        business_id: businessId,
        dossier_id: dossier.id,
        client_name: dossier.client_name,
        type_prestation: form.type_prestation,
        description: form.description || null,
        montant: m,
        montant_paye: 0,
        status: 'impayé',
        date_facture: form.date_facture,
      };
      const { error } = await (supabase as any).from('honoraires_cabinet').insert(payload);
      if (error) throw error;
      logAction({ business_id: businessId, action: 'honoraire.added', entity_type: 'dossier', entity_id: dossier.id, metadata: { reference: dossier.reference, montant: m, type_prestation: form.type_prestation } });
      success('Honoraire ajouté');
      setShowAdd(false);
      setForm({ ...form, montant: '', description: '' });
      load();
    } catch (e) { notifError(String(e)); }
    finally { setSaving(false); }
  }

  const total = lines.reduce((s, l) => s + l.montant, 0);
  const paye = lines.reduce((s, l) => s + l.montant_paye, 0);

  return (
    <SideDrawer
      isOpen={true}
      onClose={onClose}
      title={`Honoraires — ${dossier.reference}`}
      headerActions={canEdit ? (
        <button onClick={() => setShowAdd(!showAdd)} className="bg-brand-600 text-white text-[10px] font-black uppercase tracking-widest py-1 px-3 rounded-lg hover:bg-brand-500 transition-all">
          {showAdd ? 'Fermer' : 'Ajouter'}
        </button>
      ) : undefined}
    >
      <div className="space-y-4">
        {showAdd && (
          <form onSubmit={handleAdd} className="p-4 bg-surface border border-brand-500/30 rounded-2xl space-y-3 animate-in zoom-in-95 duration-200">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] uppercase font-black text-content-muted block mb-1">Montant</label>
                <input type="number" className="input text-sm h-9" value={form.montant} onChange={e => setForm({...form, montant: e.target.value})} placeholder="0" required />
              </div>
              <div>
                <label className="text-[9px] uppercase font-black text-content-muted block mb-1">Type</label>
                <select className="input text-sm h-9" value={form.type_prestation} onChange={e => setForm({...form, type_prestation: e.target.value})}>
                  <option value="provision">Provision</option>
                  <option value="honoraire">Honoraire</option>
                  <option value="consultation">Consultation</option>
                  <option value="frais">Frais / Débours</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-[9px] uppercase font-black text-content-muted block mb-1">Libellé / Note</label>
              <input className="input text-sm h-9" value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Détail de la prestation..." />
            </div>
            <button type="submit" disabled={saving} className="btn-primary w-full py-2 text-xs flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Enregistrer l'honoraire
            </button>
          </form>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="card p-3 bg-surface/30 border-surface-border">
            <p className="text-[9px] font-black text-content-muted uppercase tracking-widest mb-1">Total Facturé</p>
            <p className="text-sm font-bold text-content-primary">{new Intl.NumberFormat('fr-FR').format(total)} XOF</p>
          </div>
          <div className="card p-3 bg-surface/30 border-surface-border">
            <p className="text-[9px] font-black text-content-muted uppercase tracking-widest mb-1">Reste à payer</p>
            <p className="text-sm font-bold text-status-error">{new Intl.NumberFormat('fr-FR').format(total - paye)} XOF</p>
          </div>
        </div>

        {loading ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div> : lines.length === 0 ? (
          <div className="py-20 text-center opacity-30">
            <Receipt className="w-10 h-10 mx-auto mb-2 text-content-muted" />
            <p className="text-[10px] font-black uppercase tracking-widest">Aucune facture liée</p>
          </div>
        ) : (
          <div className="space-y-2">
            {lines.map(l => (
              <div key={l.id} className="p-3 bg-surface/50 border border-surface-border rounded-xl hover:border-surface-border transition-all group">
                <div className="flex justify-between items-start mb-1">
                  <div>
                    <p className="text-xs font-bold text-content-primary">{new Intl.NumberFormat('fr-FR').format(l.montant)} XOF</p>
                    <p className="text-[10px] text-content-muted font-medium capitalize">{l.type_prestation}</p>
                  </div>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase ${
                    l.status === 'payé' ? 'bg-badge-success text-status-success' : 'bg-badge-error text-status-error'
                  }`}>{l.status}</span>
                </div>
                {l.description && <p className="text-[10px] text-content-secondary italic mt-1 border-t border-surface-border pt-1">{l.description}</p>}
                <p className="text-[9px] text-content-muted mt-1">{new Date(l.date_facture).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </SideDrawer>
  );
}

function WorkflowPanel({ dossier, businessId, userId, onClose, canLaunch }: { dossier: Dossier; businessId: string; userId?: string; onClose: () => void; canLaunch: boolean; }) {
  const [instances, setInstances] = useState<WorkflowInstance[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const { success, error: notifError } = useNotificationStore();

  useEffect(() => {
    Promise.all([getInstancesByDossier(dossier.id), getWorkflows(businessId, true)])
      .then(([inst, wf]) => { setInstances(inst); setWorkflows(wf); })
      .finally(() => setLoading(false));
  }, [dossier.id, businessId]);

  const handleShareTracking = async () => {
    setSharing(true);
    try {
      const instanceId = instances[0]?.id;
      const { token } = await createTrackingToken(dossier.id, instanceId, dossier.client_phone || undefined, dossier.client_email || undefined);
      
      const baseUrl = window.location.origin;
      const trackUrl = `${baseUrl}/track/${token}`;
      const message = `Bonjour ${dossier.client_name}, voici le lien pour suivre l'avancement de votre dossier ${dossier.reference} en temps réel : ${trackUrl}`;
      
      const whatsappUrl = `https://wa.me/${dossier.client_phone?.replace(/\s+/g, '')}?text=${encodeURIComponent(message)}`;
      window.open(whatsappUrl, '_blank');
      success('Lien de suivi généré');
    } catch (e) { 
      notifError("Impossible de générer le lien de suivi.");
    } finally {
      setSharing(false);
    }
  };

  const handleTrigger = async (wf: Workflow) => {
    setShowPicker(false);
    try {
      const res = await triggerWorkflow({
        workflow_id: wf.id, dossier_id: dossier.id, started_by: userId,
        initial_context: { 
          dossier_id:    dossier.id, 
          reference:     dossier.reference, 
          client_name:   dossier.client_name,
          client_phone:  dossier.client_phone,
          client_email:  dossier.client_email
        }
      });
      if (res.ok) {
        const updated = await getInstancesByDossier(dossier.id);
        setInstances(updated);
        if (updated.length > 0) setExpanded(updated[0].id);
      }
    } catch (e) { console.error(e); }
  };

  return (
    <SideDrawer
      isOpen={true}
      onClose={onClose}
      title={`Processus — ${dossier.reference}`}
      headerActions={
        <div className="flex items-center gap-2">
          <button
            onClick={handleShareTracking}
            disabled={sharing}
            title="Partager le lien de suivi WhatsApp"
            className="p-2 rounded-lg bg-badge-success text-status-success hover:bg-status-success hover:text-white transition-all disabled:opacity-50"
          >
            {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
          </button>
          <button onClick={() => setShowPicker(!showPicker)} className="bg-brand-600 text-white text-[10px] font-black uppercase tracking-widest py-1 px-3 rounded-lg hover:bg-brand-500 transition-all">Lancer</button>
        </div>
      }
    >
      <div className="space-y-3">
        {showPicker && (
          <div className="bg-surface-overlay border border-surface-border rounded-xl overflow-hidden mb-4 shadow-xl animate-in fade-in slide-in-from-top-2">
            {workflows.length === 0 ? (
              <p className="p-4 text-xs text-content-muted italic text-center">Aucun workflow actif</p>
            ) : (
              workflows.map(wf => (
                <button key={wf.id} onClick={() => handleTrigger(wf)} className="w-full text-left px-4 py-3 hover:bg-surface text-sm text-content-primary border-b border-surface-border last:border-0 font-medium transition-colors">{wf.name}</button>
              ))
            )}
          </div>
        )}
        {loading ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div> : instances.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <GitBranch className="w-10 h-10 text-content-muted mx-auto" />
            <p className="text-xs text-content-muted italic font-medium tracking-tight">Aucun processus en cours pour ce dossier.</p>
          </div>
        ) : (
          instances.map(inst => (
            <div key={inst.id} className="card overflow-hidden bg-surface/50 hover:bg-surface transition-colors">
              <button onClick={() => setExpanded(expanded === inst.id ? null : inst.id)} className="w-full flex items-center justify-between px-4 py-3">
                <div className="flex flex-col items-start gap-0.5">
                  <span className="text-[10px] text-content-brand font-black uppercase tracking-widest">{inst.status}</span>
                  <span className="text-[9px] text-content-muted font-mono">ID: {inst.id.slice(0,8)}</span>
                </div>
                {expanded === inst.id ? <ChevronDown className="w-4 h-4 text-content-secondary" /> : <ChevronRight className="w-4 h-4 text-content-secondary" />}
              </button>
              {expanded === inst.id && (
                <div className="p-3 border-t border-surface-border bg-surface/30">
                  <WorkflowRunner instance={inst} currentUserId={userId} onTransition={() => getInstancesByDossier(dossier.id).then(setInstances)} />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </SideDrawer>
  );
}

function FichiersPanel({ dossier, businessId, storageInfo, onClose, onStorageChange }: { dossier: Dossier; businessId: string; storageInfo: StorageInfo | null; onClose: () => void; onStorageChange: () => void; }) {
  const [fichiers, setFichiers] = useState<DossierFichier[]>([]);
  const [loading, setLoading] = useState(true);
  const { error: notifError } = useNotificationStore();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getFichiers(dossier.id);
      setFichiers(data);
    } catch (e) { notifError(String(e)); }
    finally { setLoading(false); }
  }, [dossier.id, notifError]);

  useEffect(() => { load(); }, [load]);

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    try {
      for (const file of Array.from(files)) {
        await uploadFichier(dossier.id, businessId, file);
      }
      load();
      onStorageChange();
    } catch (e) { notifError(String(e)); }
  }

  return (
    <SideDrawer
      isOpen={true}
      onClose={onClose}
      title={`Fichiers — ${dossier.reference}`}
      footer={storageInfo ? (
        <div>
          <div className="flex justify-between items-center text-[10px] font-black uppercase text-content-muted mb-1.5 tracking-widest">
            <span>Stockage Dossiers</span>
            <span>{Math.round(storageInfo.used_pct)}%</span>
          </div>
          <div className="h-1.5 bg-surface-card rounded-full overflow-hidden">
            <div className="h-full bg-brand-500 transition-all" style={{ width: `${storageInfo.used_pct}%` }} />
          </div>
          <p className="text-[9px] text-content-muted mt-2 italic">Limite : {formatBytes(storageInfo.quota_bytes)} par cabinet.</p>
        </div>
      ) : undefined}
    >
      <div className="space-y-4">
        <label className="flex flex-col items-center justify-center py-6 px-4 bg-surface/50 border-2 border-dashed border-surface-border rounded-2xl cursor-pointer hover:bg-surface hover:border-brand-500/50 transition-all group">
          <Upload className="w-6 h-6 text-content-muted group-hover:text-content-brand mb-2" />
          <span className="text-xs font-bold text-content-secondary group-hover:text-content-primary">Déposer des fichiers ici</span>
          <input type="file" multiple onChange={e => handleFiles(e.target.files)} className="hidden" />
        </label>

        {loading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div> : fichiers.length === 0 ? (
          <div className="py-20 text-center opacity-30">
            <HardDrive className="w-8 h-8 mx-auto mb-2" />
            <p className="text-[10px] font-black uppercase tracking-widest">Aucun fichier</p>
          </div>
        ) : (
          <div className="grid gap-2">
            {fichiers.map(f => (
              <div key={f.id} className="flex items-center justify-between p-3 bg-surface/50 rounded-xl border border-surface-border transition-all group">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-lg">{getFileIcon(f.mime_type)}</span>
                  <div className="min-w-0">
                    <p className="text-xs text-content-primary font-medium truncate">{f.nom}</p>
                    <p className="text-[9px] text-content-muted font-bold uppercase">{formatBytes(f.taille_bytes)}</p>
                  </div>
                </div>
                <button
                  onClick={() => getSignedUrl(f.storage_path).then(url => window.open(url, '_blank'))}
                  className="p-2 text-content-muted hover:text-content-primary hover:bg-surface-card rounded-lg transition-all"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </SideDrawer>
  );
}

// ─── Processus Manager ───────────────────────────────────────────────────────

function ProcessusManager({ businessId, isOwnerOrAdmin, userId }: { businessId: string; isOwnerOrAdmin: boolean; userId?: string }) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [historyWf, setHistoryWf] = useState<Workflow | null>(null);
  const [versions, setVersions] = useState<WorkflowVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const { error: notifError, success } = useNotificationStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getWorkflows(businessId);
      setWorkflows(data);
    } catch (e) { notifError(String(e)); }
    finally { setLoading(false); }
  }, [businessId, notifError]);

  useEffect(() => { load(); }, [load]);

  const loadVersions = async (wf: Workflow) => {
    setHistoryWf(wf);
    setLoadingVersions(true);
    try {
      const data = await getWorkflowVersions(wf.id);
      setVersions(data);
    } catch (e) { notifError(String(e)); }
    finally { setLoadingVersions(false); }
  };

  const handleExportVersion = (v: WorkflowVersion) => {
    const data = {
      name: `${historyWf?.name} (v${v.version})`,
      description: historyWf?.description,
      definition: v.definition,
      version: v.version,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workflow_${historyWf?.name.toLowerCase().replace(/\s+/g, '_')}_v${v.version}.json`;
    a.click();
    URL.revokeObjectURL(url);
    success('Version exportée');
  };

  const handleRestore = async (v: WorkflowVersion) => {
    if (!confirm(`Restaurer la version ${v.version} ? Cela créera une nouvelle version (v${(historyWf?.version || 0) + 1}) basée sur celle-ci.`)) return;
    try {
      await saveWorkflow(businessId, v.definition, historyWf!.name, historyWf!.description ?? undefined, historyWf!.id, userId);
      success('Version restaurée');
      setHistoryWf(null);
      load();
    } catch (e) { notifError(String(e)); }
  };

  const handleDelete = async (id: string) => {
    if (!isOwnerOrAdmin) return;
    if (!confirm('Supprimer ce processus définitivement ?')) return;
    try {
      await deleteWorkflow(id);
      success('Processus supprimé');
      load();
    } catch (e) { notifError(String(e)); }
  };

  const handleToggle = async (wf: Workflow) => {
    if (!isOwnerOrAdmin) return;
    try {
      await toggleWorkflowStatus(wf.id, !wf.is_active);
      success(wf.is_active ? 'Processus désactivé' : 'Processus activé');
      load();
    } catch (e) { notifError(String(e)); }
  };

  const handleExport = (wf: Workflow) => {
    const data = {
      name: wf.name,
      description: wf.description,
      definition: wf.definition,
      version: wf.version,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workflow_${wf.name.toLowerCase().replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    success('Processus exporté');
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const content = ev.target?.result as string;
        const data = JSON.parse(content);

        if (!data.name || !data.definition) {
          throw new Error("Le fichier JSON ne semble pas être un processus valide (nom ou définition manquante).");
        }

        await saveWorkflow(businessId, data.definition, `${data.name} (Importé)`, data.description);
        success('Processus importé avec succès');
        load();
      } catch (err) {
        notifError(toUserError(err));
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const filtered = workflows.filter(w => w.name.toLowerCase().includes(search.toLowerCase()));

  // Pagination simple
  const [page, setPage] = useState(1);
  const perPage = 10;
  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  if (editingId !== null) {
    const selected = workflows.find(w => w.id === editingId);
    return (
      <div className="space-y-4 animate-in fade-in duration-500 h-full">
        <button onClick={() => setEditingId(null)} className="flex items-center gap-2 text-sm text-content-secondary hover:text-content-primary transition-colors font-bold px-1">
          <ChevronLeft className="w-4 h-4" /> Retour à la liste
        </button>
        <WorkflowBuilder businessId={businessId} workflowId={selected?.id} initialName={selected?.name} initialDef={selected?.definition} onSaved={() => { setEditingId(null); load(); }} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="relative flex-1 max-w-md w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
          <input className="input pl-11 py-2.5 text-sm bg-surface/50" placeholder="Rechercher un processus..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="flex items-center gap-2">
          {isOwnerOrAdmin && (
            <>
              <input type="file" ref={fileInputRef} onChange={handleImport} accept=".json" className="hidden" />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="bg-surface-card hover:bg-surface-input text-content-primary font-black py-2.5 px-4 rounded-2xl flex items-center gap-2 transition-all active:scale-95 text-xs uppercase tracking-widest border border-surface-border"
              >
                <Upload className="w-4 h-4" /> Import
              </button>
              <button onClick={() => setEditingId('new')} className="bg-brand-500 hover:bg-brand-600 text-content-primary font-black py-2.5 px-6 rounded-2xl flex items-center gap-2 shadow-xl shadow-brand-500/20 transition-all active:scale-95 text-xs uppercase tracking-widest">
                <Plus className="w-4 h-4" /> Nouveau Processus
              </button>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-500" /></div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center text-content-muted italic border-dashed">Aucun processus trouvé.</div>
      ) : (
        <div className="space-y-4">
          <div className="card overflow-hidden bg-surface/20 border-surface-border shadow-2xl">
            <table className="w-full text-sm">
              <thead className="bg-surface/50 border-b border-surface-border text-content-muted uppercase text-[9px] font-black tracking-[0.2em]">
                <tr className="text-left">
                  <th className="px-6 py-4">Nom du processus</th>
                  <th className="px-6 py-4 text-center">Version</th>
                  <th className="px-6 py-4">Statut</th>
                  <th className="px-6 py-4">Dernière modification</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border/50">
                {paginated.map(w => (
                  <tr key={w.id} className="hover:bg-surface/40 transition-colors group">
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => setEditingId(w.id)}
                        className="flex items-center gap-3 text-left group/name"
                        title="Éditer le design"
                      >
                        <div className={`p-2 rounded-lg transition-colors ${w.is_active ? 'bg-brand-500/10 text-content-brand group-hover/name:bg-brand-500/20' : 'bg-surface-card text-content-muted group-hover/name:bg-surface-input'}`}>
                          <GitBranch className="w-4 h-4" />
                        </div>
                        <p className="font-bold text-content-primary group-hover/name:text-content-brand transition-colors">{w.name}</p>
                      </button>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="px-2 py-0.5 rounded-md bg-brand-500/10 border border-brand-500/20 text-content-brand font-mono text-[10px] font-bold">v{w.version}</span>
                    </td>
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => handleToggle(w)} 
                        disabled={!isOwnerOrAdmin}
                        className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest ${w.is_active ? 'text-status-success' : 'text-content-muted'} ${!isOwnerOrAdmin ? 'cursor-default' : ''}`}
                      >
                        {w.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5 opacity-30" />}
                        {w.is_active ? 'Actif' : 'Désactivé'}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-content-muted text-xs font-medium italic">
                      {fmtDate(w.updated_at || w.created_at)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isOwnerOrAdmin && (
                          <>
                            <button onClick={() => loadVersions(w)} className="p-2 rounded-lg hover:bg-surface-card text-content-secondary hover:text-status-info transition-all" title="Historique des versions"><History className="w-4 h-4" /></button>
                            <button onClick={() => handleExport(w)} className="p-2 rounded-lg hover:bg-surface-card text-content-secondary hover:text-status-success transition-all" title="Exporter en JSON"><Download className="w-4 h-4" /></button>
                            <button onClick={() => setEditingId(w.id)} className="p-2 rounded-lg hover:bg-surface-card text-content-secondary hover:text-content-primary transition-all" title="Éditer le design"><Pencil className="w-4 h-4" /></button>
                            <button onClick={() => handleDelete(w.id)} className="p-2 rounded-lg hover:bg-badge-error text-content-secondary hover:text-status-error transition-all" title="Supprimer définitivement"><Trash2 className="w-4 h-4" /></button>
                          </>
                        )}
                        {!isOwnerOrAdmin && <span className="text-[10px] text-content-muted font-bold uppercase tracking-widest px-2">Lecture seule</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-2 pt-2">
              <p className="text-[10px] font-black text-content-muted uppercase tracking-widest">Page {page} sur {totalPages}</p>
              <div className="flex gap-2">
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="p-2 rounded-xl border border-surface-border text-content-secondary hover:text-content-primary disabled:opacity-20 transition-all"><ChevronLeft className="w-4 h-4" /></button>
                <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="p-2 rounded-xl border border-surface-border text-content-secondary hover:text-content-primary disabled:opacity-20 transition-all"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Panel Historique */}
      {historyWf && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-surface-card border border-surface-border rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 border-b border-surface-border">
              <div>
                <h2 className="text-content-primary font-bold">Historique : {historyWf.name}</h2>
                <p className="text-[10px] text-content-muted uppercase font-black tracking-widest mt-0.5">Versions précédentes archivées</p>
              </div>
              <button onClick={() => setHistoryWf(null)} className="p-2 rounded-xl hover:bg-surface-card text-content-secondary transition-all"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto p-4 space-y-3 scrollbar-thin">
              {loadingVersions ? (
                <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div>
              ) : versions.length === 0 ? (
                <p className="text-center text-content-muted py-12 italic text-sm">Aucune version antérieure enregistrée.</p>
              ) : (
                versions.map(v => (
                  <div key={v.id} className="card p-4 bg-surface/50 border-surface-border hover:border-surface-border transition-all group">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-surface-card border border-surface-border text-content-primary font-mono text-[10px] font-bold">v{v.version}</span>
                          <p className="text-xs text-content-secondary italic">{new Date(v.created_at).toLocaleString()}</p>
                        </div>
                        <p className="text-[10px] text-content-muted">{v.definition.nodes.length} étapes • {v.definition.edges.length} transitions</p>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => handleExportVersion(v)}
                          className="opacity-0 group-hover:opacity-100 bg-surface-card text-content-secondary hover:text-status-success p-1.5 rounded-lg transition-all"
                          title="Exporter cette version"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => handleRestore(v)}
                          className="opacity-0 group-hover:opacity-100 bg-brand-500/10 text-content-brand hover:bg-brand-500 hover:text-content-primary px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all"
                        >
                          Restaurer
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page Principale ─────────────────────────────────────────────────────────

export default function DossiersPage() {
  const { business, user } = useAuthStore();
  const { error: notifError, success } = useNotificationStore();
  const can = useCan();

  const [tab, setTab] = useState<'dossiers' | 'monitoring' | 'workflows' | 'pretentions' | 'config'>('dossiers');
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [typesAffaire, setTypesAffaire] = useState<RefItem[]>([]);
  const [tribunaux, setTribunaux] = useState<RefItem[]>([]);
  const [statuts, setStatuts] = useState<RefItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'new' | Dossier | null>(null);
  const [workflowPanel, setWorkflowPanel] = useState<Dossier | null>(null);
  const [fichiersPanel, setFichiersPanel] = useState<Dossier | null>(null);
  const [financesPanel, setFinancesPanel] = useState<Dossier | null>(null);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    if (!business) return;
    setLoading(true);
    try {
      const [d, ta, tr, st] = await Promise.all([
        supabase.from('dossiers' as any).select('*').eq('business_id', business.id).order('created_at', { ascending: false }),
        getReferenceData('type_affaire',   business.id),
        getReferenceData('tribunal',       business.id),
        getReferenceData('statut_dossier', business.id),
      ]);
      setDossiers((d.data as any) ?? []);
      setTypesAffaire(ta); setTribunaux(tr); setStatuts(st);
    } catch (e) { notifError(toUserError(e)); }
    finally { setLoading(false); }
  }, [business, notifError]);

  const handleArchive = async (dossier: Dossier, archive: boolean) => {
    try {
      const { error } = await supabase.from('dossiers' as any)
        .update({ status: archive ? 'archivé' : 'ouvert' })
        .eq('id', dossier.id);
      if (error) throw error;
      logAction({ business_id: business!.id, action: archive ? 'dossier.archived' : 'dossier.unarchived', entity_type: 'dossier', entity_id: dossier.id, metadata: { reference: dossier.reference } });
      success(archive ? 'Dossier archivé' : 'Dossier désarchivé');
      load();
    } catch (e) { notifError(toUserError(e)); }
  };

  const loadStorage = useCallback(async () => {
    if (business) getStorageInfo(business.id).then(setStorageInfo).catch(() => {});
  }, [business]);

  useEffect(() => { load(); loadStorage(); }, [load, loadStorage]);

  // Gestion du paramètre de recherche 'ref' (provenant des honoraires)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref && dossiers.length > 0) {
      setSearch(ref);
      const found = dossiers.find(d => d.reference === ref);
      if (found) setFinancesPanel(found);
    }
  }, [dossiers]);

  const filtered = dossiers.filter(d => {
    const matchesSearch = !search || d.reference.toLowerCase().includes(search.toLowerCase()) || d.client_name.toLowerCase().includes(search.toLowerCase());
    const isArchived = d.status === 'archivé';
    return matchesSearch && (isArchived === showArchived);
  });

  const TABS = [
    { id: 'dossiers'    as const, label: 'Dossiers',          icon: <Scale      className="w-4 h-4" /> },
    { id: 'monitoring'  as const, label: 'Suivi',             icon: <Activity   className="w-4 h-4" /> },
    { id: 'workflows'   as const, label: 'Processus',         icon: <GitBranch  className="w-4 h-4" /> },
    { id: 'pretentions' as const, label: 'Modèles juridiques', icon: <BookOpen   className="w-4 h-4" /> },
    ...(can('manage_legal_config') ? [{ id: 'config' as const, label: 'Paramètres', icon: <Settings2 className="w-4 h-4" /> }] : []),
  ];

  if (!business) return null;

  return (
    <div className="h-full overflow-y-auto bg-surface/20">
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-status-purple shadow-glow">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-content-primary tracking-tight">Gestion des Dossiers</h1>
              <p className="text-content-muted text-xs font-bold uppercase tracking-[0.1em] mt-0.5">Espace Juridique & Procédures</p>
            </div>
          </div>
          {tab === 'dossiers' && (
            <div className="flex items-center gap-2">
              {business?.id && (
                <button
                  onClick={() => window.open(`/juridique/${business.id}`, '_blank', 'noopener,noreferrer')}
                  className="bg-surface border border-surface-border text-content-secondary hover:text-content-primary font-black py-3 px-4 rounded-2xl flex items-center gap-2 shadow-xl transition-all active:scale-95 text-xs uppercase tracking-widest"
                  title="Ouvrir la page publique de rendez-vous"
                >
                  <ExternalLink className="w-4 h-4" /> Page Publique
                </button>
              )}
              {can('create_dossier') && (
                <button onClick={() => setModal('new')} className="bg-brand-500 hover:bg-brand-600 text-content-primary font-black py-3 px-6 rounded-2xl flex items-center gap-2 shadow-xl shadow-brand-500/20 transition-all active:scale-95 text-xs uppercase tracking-widest">
                  <Plus className="w-5 h-5" /> Nouveau Dossier
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-1 p-1 bg-surface border border-surface-border rounded-2xl w-fit shadow-xl">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${tab === t.id ? 'bg-brand-600 text-content-primary shadow-lg shadow-brand-500/20' : 'text-content-muted hover:text-content-primary hover:bg-surface-card/50'}`}>{t.icon}{t.label}</button>
          ))}
        </div>

        {tab === 'dossiers' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center">
              <div className="relative group flex-1">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-content-muted group-focus-within:text-content-brand transition-colors" />
                <input className="w-full bg-surface border border-surface-border rounded-2xl pl-14 pr-6 py-4 text-base text-content-primary placeholder-slate-600 focus:outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500/50 transition-all shadow-inner" placeholder="Rechercher un dossier par référence ou client..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <button 
                onClick={() => setShowArchived(!showArchived)}
                className={`flex items-center gap-2 px-6 py-4 rounded-2xl border font-bold text-xs uppercase tracking-widest transition-all ${showArchived ? 'bg-amber-500/10 border-amber-500/50 text-status-warning' : 'bg-surface border-surface-border text-content-secondary hover:text-content-primary'}`}
              >
                {showArchived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                {showArchived ? 'Voir Dossiers Actifs' : 'Voir l\'Archive'}
              </button>
            </div>

            {loading ? <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-status-purple" /></div> : filtered.length === 0 ? (
              <div className="card p-24 text-center space-y-4 border-dashed bg-transparent border-surface-border">
                <Briefcase className="w-12 h-12 text-content-muted mx-auto" />
                <p className="text-content-muted font-bold tracking-tight">Aucun dossier trouvé.</p>
              </div>
            ) : (
              <div className="card overflow-hidden bg-surface/20 border-surface-border shadow-2xl">
                <table className="w-full text-sm">
                  <thead className="bg-surface/50 border-b border-surface-border text-content-muted uppercase text-[9px] font-black tracking-[0.2em]"><tr className="text-left"><th className="px-6 py-4">Référence</th><th className="px-6 py-4">Client</th><th className="px-6 py-4">Contact</th><th className="px-6 py-4">Type d&apos;affaire</th><th className="px-6 py-4 text-center">Status</th><th className="px-6 py-4 text-right">Actions</th></tr></thead>
                  <tbody className="divide-y divide-surface-border/50">
                    {filtered.map(d => (
                      <tr key={d.id} className="hover:bg-surface/40 transition-colors group">
                        <td className="px-6 py-4 font-mono text-status-purple font-bold">{d.reference}</td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-content-primary font-bold tracking-tight">{d.client_name}</span>
                            <span className="text-[10px] text-content-muted uppercase font-medium">{d.adversaire ? `vs ${d.adversaire}` : ''}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-0.5">
                            {d.client_phone && <span className="text-content-primary text-xs flex items-center gap-1.5"><Phone className="w-3 h-3 text-content-brand" /> {d.client_phone}</span>}
                            {d.client_email && <span className="text-content-muted text-[11px] flex items-center gap-1.5"><Mail className="w-3 h-3" /> {d.client_email}</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-content-secondary font-medium">{d.type_affaire}</td>
                        <td className="px-6 py-4 text-center"><StatusBadge status={d.status} statuts={statuts} /></td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => setFinancesPanel(d)} className="p-2.5 rounded-xl hover:bg-surface-card text-content-secondary hover:text-status-success transition-all" title="Honoraires & Finances"><Receipt className="w-4 h-4" /></button>
                            <button onClick={() => setWorkflowPanel(d)} className="p-2.5 rounded-xl hover:bg-surface-card text-content-secondary hover:text-content-brand transition-all" title="Suivi Processus"><GitBranch className="w-4 h-4" /></button>
                            <button onClick={() => setFichiersPanel(d)} className="p-2.5 rounded-xl hover:bg-surface-card text-content-secondary hover:text-status-purple transition-all" title="Pièces Jointes"><Paperclip className="w-4 h-4" /></button>
                            {can('edit_dossier') && (
                              <button onClick={() => setModal(d)} className="p-2.5 rounded-xl hover:bg-surface-card text-content-secondary hover:text-content-primary transition-all" title="Modifier Dossier"><Pencil className="w-4 h-4" /></button>
                            )}
                            {can('archive_dossier') && (
                              <button 
                                onClick={() => handleArchive(d, !showArchived)} 
                                className={`p-2.5 rounded-xl hover:bg-surface-card transition-all ${showArchived ? 'text-status-warning hover:text-status-warning' : 'text-content-secondary hover:text-status-warning'}`}
                                title={showArchived ? 'Désarchiver' : 'Archiver'}
                              >
                                {showArchived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'monitoring' && <MonitoringDashboard businessId={business.id} />}
        {tab === 'workflows' && <ProcessusManager businessId={business.id} isOwnerOrAdmin={can('manage_workflows')} userId={user?.id} />}
        {tab === 'pretentions' && <PretentionsLibrary businessId={business.id} />}
        {tab === 'config' && <ConfigTab businessId={business.id} onRefresh={load} />}
      </div>

      {modal && <DossierModal initial={modal === 'new' ? null : modal} count={dossiers.length} businessId={business.id} typesAffaire={typesAffaire} tribunaux={tribunaux} statuts={statuts} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
      {workflowPanel && <WorkflowPanel dossier={workflowPanel} businessId={business.id} userId={user?.id} canLaunch={can('launch_workflow')} onClose={() => setWorkflowPanel(null)} />}
      {fichiersPanel && <FichiersPanel dossier={fichiersPanel} businessId={business.id} storageInfo={storageInfo} onClose={() => setFichiersPanel(null)} onStorageChange={loadStorage} />}
      {financesPanel && <FinancesPanel dossier={financesPanel} businessId={business.id} canEdit={can('add_fee')} onClose={() => setFinancesPanel(null)} />}
    </div>
  );
}
