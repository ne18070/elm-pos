'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  Plus, Briefcase, Search, Loader2, X, Check, Pencil, Trash2, 
  Phone, Scale, Calendar, Paperclip, Upload, ExternalLink, 
  HardDrive, AlertTriangle, GitBranch, Play, ChevronLeft, ChevronRight, 
  ChevronDown, PauseCircle, XCircle, CheckCircle2, Clock, Mail,
  Activity, BookOpen, Settings2, Building2, UserCircle2, ToggleLeft, ToggleRight,
  ShieldCheck
} from 'lucide-react';

import { toUserError } from '@/lib/user-error';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { supabase } from '@/lib/supabase';
import { canDelete } from '@/lib/permissions';

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
import { getInstancesByDossier, getWorkflows, deleteWorkflow, toggleWorkflowStatus, createTrackingToken } from '@services/supabase/workflows';
import { triggerWorkflow } from '@/lib/workflow-runtime';

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
  const cls = (s?.metadata?.cls as string) ?? 'bg-slate-800 text-slate-400 border-slate-700';
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
      <div className="flex gap-1 p-1 bg-slate-900/50 border border-slate-800 rounded-xl w-fit">
        {[
          { id: 'type_affaire',   label: 'Types d\'affaire' },
          { id: 'tribunal',       label: 'Tribunaux' },
          { id: 'statut_dossier', label: 'Statuts' },
          { id: 'type_client',    label: 'Types de client' },
        ].map(c => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id as any)}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${category === c.id ? 'bg-brand-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
          ) : items.length === 0 ? (
            <div className="card p-12 text-center text-slate-500 italic">Aucun élément configuré</div>
          ) : (
            <div className="grid gap-2">
              {items.map(item => (
                <div key={item.id} className="card p-4 flex items-center justify-between group bg-slate-900/30">
                  <div>
                    <p className="font-bold text-white text-sm">{item.label}</p>
                    <p className="text-[10px] text-slate-500 font-mono mt-0.5">{item.value}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setEditing(item)} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(item.id)} className="p-2 rounded-lg hover:bg-red-900/20 text-slate-400 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5 space-y-4 h-fit sticky top-6">
          <h3 className="font-bold text-white text-sm flex items-center gap-2 border-b border-slate-800 pb-3">
            {editing?.id ? <Pencil className="w-4 h-4 text-blue-400" /> : <Plus className="w-4 h-4 text-green-400" />}
            {editing?.id ? 'Modifier' : 'Ajouter un élément'}
          </h3>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="text-[10px] uppercase font-black text-slate-500 mb-1.5 block">Nom (Libellé)</label>
              <input className="input text-sm bg-slate-950" value={editing?.label ?? ''} onChange={e => setEditing(p => ({ ...p, label: e.target.value }))} placeholder="Ex: Tribunal de Grande Instance" required />
            </div>
            <div>
              <label className="text-[10px] uppercase font-black text-slate-500 mb-1.5 block">Code (Clé unique)</label>
              <input className="input text-sm bg-slate-950 font-mono" value={editing?.value ?? ''} onChange={e => setEditing(p => ({ ...p, value: e.target.value.toLowerCase().replace(/\s+/g, '_') }))} placeholder="ex: tgi_dakar" required disabled={!!editing?.id} />
            </div>
            <div className="flex gap-2 pt-2">
              <button type="submit" className="flex-1 bg-brand-500 hover:bg-brand-600 text-white font-bold py-2 rounded-xl text-xs transition-all">{editing?.id ? 'Mettre à jour' : 'Ajouter à la liste'}</button>
              {editing && <button type="button" onClick={() => setEditing(null)} className="px-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs">Annuler</button>}
            </div>
          </form>
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
  
  useEffect(() => {
    getClients(businessId).then(setAllClients);
    getReferenceData('type_client', businessId).then(setTypesClient);
    getWorkflows(businessId, true).then(setWorkflows);
    if (initial) {
      getInstancesByDossier(initial.id).then(setInstances);
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
      } else {
        const { data, error } = await supabase.from('dossiers' as any).insert(payload).select().single();
        if (error) throw error;
        saved = data as unknown as Dossier;

        if (form.selectedWorkflow) {
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
          <h2 className="text-white font-bold">{initial ? `Modifier — ${initial.reference}` : 'Nouveau dossier'}</h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 transition-all"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto p-5 space-y-5 scrollbar-thin">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Référence Dossier</label><input className="input" value={form.reference} onChange={(e) => set('reference', e.target.value)} /></div>
            <div><label className="label">Type d'affaire</label><select className="input" value={form.type_affaire} onChange={(e) => set('type_affaire', e.target.value)}>
              {typesAffaire.map((t) => <option key={t.value} value={t.value} className="bg-gray-900 text-white">{t.label}</option>)}
            </select></div>
          </div>

          <div className="p-5 bg-slate-900/30 border border-slate-800 rounded-2xl space-y-4">
            <div className="flex items-center gap-2 text-brand-400 mb-1">
              <UserCircle2 className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Entité Juridique (Client)</span>
            </div>

            <div className="relative" ref={searchRef}>
              <label className="label">Nom de l'entité / Client <span className="text-red-400">*</span></label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input className="input pl-10" value={form.client_name || clientSearch} onChange={(e) => { set('client_name', e.target.value); setClientSearch(e.target.value); setShowClientResults(true); }} onFocus={() => setShowClientResults(true)} placeholder="Rechercher ou saisir..." />
              </div>
              {showClientResults && clientSearch.length > 0 && filteredClients.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                  {filteredClients.map(c => (
                    <button key={c.id} onClick={() => selectClient(c)} className="w-full text-left px-4 py-3 hover:bg-slate-800 border-b border-slate-800 last:border-0 flex items-center justify-between">
                      <div><p className="text-sm text-white font-bold">{c.name}</p><p className="text-[10px] text-slate-500">{c.phone || c.email || '—'}</p></div>
                      <Plus className="w-3.5 h-3.5 text-brand-400" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Type d'entité</label>
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
            <div><label className="label">Tribunal / Juridiction</label><select className="input" value={form.tribunal || ''} onChange={(e) => set('tribunal', e.target.value)}>
              <option value="">— Sélectionner —</option>
              {tribunaux.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Date d'ouverture</label><input type="date" className="input" value={form.date_ouverture} onChange={(e) => set('date_ouverture', e.target.value)} /></div>
            <div><label className="label">Prochaine audience</label><input type="date" className="input" value={form.date_audience} onChange={(e) => set('date_audience', e.target.value)} /></div>
          </div>
          
          {initial ? (
            <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-slate-400">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span className="text-[10px] font-black uppercase tracking-widest">Processus Verrouillé (Audit)</span>
              </div>
              <p className="text-sm font-bold text-white italic">
                {workflows.find(w => instances.some(i => i.workflow_id === w.id))?.name || "Processus actif"}
              </p>
              <p className="text-[10px] text-slate-500 leading-tight">
                Pour garantir l'intégrité de l'audit juridique, le modèle de procédure ne peut plus être modifié une fois lancé.
              </p>
            </div>
          ) : workflows.length > 0 && (
            <div className="p-4 bg-brand-500/5 border border-brand-500/20 rounded-2xl space-y-3">
              <div className="flex items-center gap-2 text-brand-400"><GitBranch className="w-4 h-4" /><span className="text-xs font-bold uppercase">Automatisation</span></div>
              <select className="input bg-slate-900" value={form.selectedWorkflow} onChange={(e) => set('selectedWorkflow', e.target.value)}>
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
    </div>
  );
}

// ─── Panneaux Processus & Fichiers ───────────────────────────────────────────

function WorkflowPanel({ dossier, businessId, userId, onClose }: { dossier: Dossier; businessId: string; userId?: string; onClose: () => void; }) {
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
    <div className="absolute inset-0 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[440px] bg-surface-card border-l border-surface-border flex flex-col z-40 shadow-2xl animate-in slide-in-from-right duration-300">
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border bg-slate-900/50">
        <p className="text-sm font-bold text-white tracking-tight">Processus — {dossier.reference}</p>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleShareTracking} 
            disabled={sharing}
            title="Partager le lien de suivi WhatsApp"
            className="p-2 rounded-lg bg-green-600/10 text-green-500 hover:bg-green-600 hover:text-white transition-all disabled:opacity-50"
          >
            {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
          </button>
          <button onClick={() => setShowPicker(!showPicker)} className="bg-brand-500 text-white text-[10px] font-black uppercase tracking-widest py-1 px-3 rounded-lg hover:bg-brand-600 transition-all">Lancer</button>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 transition-all"><X className="w-4 h-4" /></button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
        {showPicker && (
          <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden mb-4 shadow-xl animate-in fade-in slide-in-from-top-2">
            {workflows.length === 0 ? (
              <p className="p-4 text-xs text-slate-500 italic text-center">Aucun workflow actif</p>
            ) : (
              workflows.map(wf => (
                <button key={wf.id} onClick={() => handleTrigger(wf)} className="w-full text-left px-4 py-3 hover:bg-slate-900 text-sm text-white border-b border-slate-800 last:border-0 font-medium transition-colors">{wf.name}</button>
              ))
            )}
          </div>
        )}
        {loading ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div> : instances.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <GitBranch className="w-10 h-10 text-slate-800 mx-auto" />
            <p className="text-xs text-slate-500 italic font-medium tracking-tight">Aucun processus en cours pour ce dossier.</p>
          </div>
        ) : (
          instances.map(inst => (
            <div key={inst.id} className="card overflow-hidden bg-slate-900/50 hover:bg-slate-900 transition-colors">
              <button onClick={() => setExpanded(expanded === inst.id ? null : inst.id)} className="w-full flex items-center justify-between px-4 py-3">
                <div className="flex flex-col items-start gap-0.5">
                  <span className="text-[10px] text-brand-400 font-black uppercase tracking-widest">{inst.status}</span>
                  <span className="text-[9px] text-slate-500 font-mono">ID: {inst.id.slice(0,8)}</span>
                </div>
                {expanded === inst.id ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
              </button>
              {expanded === inst.id && (
                <div className="p-3 border-t border-slate-800 bg-slate-950/30">
                  <WorkflowRunner instance={inst} currentUserId={userId} onTransition={() => getInstancesByDossier(dossier.id).then(setInstances)} />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
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
    <div className="absolute inset-0 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-96 bg-surface-card border-l border-surface-border flex flex-col z-40 shadow-2xl animate-in slide-in-from-right duration-300">
      <div className="p-4 border-b border-surface-border flex justify-between items-center bg-slate-900/50">
        <p className="text-sm font-bold text-white tracking-tight">Fichiers — {dossier.reference}</p>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 transition-all"><X className="w-4 h-4" /></button>
      </div>
      <div className="p-4 flex-1 overflow-y-auto space-y-4 scrollbar-thin">
        <label className="flex flex-col items-center justify-center py-6 px-4 bg-slate-900/50 border-2 border-dashed border-slate-700 rounded-2xl cursor-pointer hover:bg-slate-900 hover:border-brand-500/50 transition-all group">
          <Upload className="w-6 h-6 text-slate-500 group-hover:text-brand-400 mb-2" />
          <span className="text-xs font-bold text-slate-400 group-hover:text-white">Déposer des fichiers ici</span>
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
              <div key={f.id} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-xl border border-slate-800 hover:border-slate-700 transition-all group">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-lg">{getFileIcon(f.mime_type)}</span>
                  <div className="min-w-0">
                    <p className="text-xs text-white font-medium truncate">{f.nom}</p>
                    <p className="text-[9px] text-slate-500 font-bold uppercase">{formatBytes(f.taille_bytes)}</p>
                  </div>
                </div>
                <button 
                  onClick={() => getSignedUrl(f.storage_path).then(url => window.open(url, '_blank'))}
                  className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {storageInfo && (
        <div className="p-4 border-t border-surface-border bg-slate-900/30">
          <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-500 mb-1.5 tracking-widest">
            <span>Stockage Dossiers</span>
            <span>{Math.round(storageInfo.used_pct)}%</span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-brand-500 transition-all" style={{ width: `${storageInfo.used_pct}%` }} />
          </div>
          <p className="text-[9px] text-slate-600 mt-2 italic">Limite : {formatBytes(storageInfo.quota_bytes)} par cabinet.</p>
        </div>
      )}
    </div>
  );
}

// ─── Processus Manager ───────────────────────────────────────────────────────

function ProcessusManager({ businessId }: { businessId: string }) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const { error: notifError, success } = useNotificationStore();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getWorkflows(businessId);
      setWorkflows(data);
    } catch (e) { notifError(String(e)); }
    finally { setLoading(false); }
  }, [businessId, notifError]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce processus définitivement ?')) return;
    try {
      await deleteWorkflow(id);
      success('Processus supprimé');
      load();
    } catch (e) { notifError(String(e)); }
  };

  const handleToggle = async (wf: Workflow) => {
    try {
      await toggleWorkflowStatus(wf.id, !wf.is_active);
      success(wf.is_active ? 'Processus désactivé' : 'Processus activé');
      load();
    } catch (e) { notifError(String(e)); }
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
        <button onClick={() => setEditingId(null)} className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors font-bold px-1">
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
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input className="input pl-11 py-2.5 text-sm bg-slate-900/50" placeholder="Rechercher un processus..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <button onClick={() => setEditingId('new')} className="bg-brand-500 hover:bg-brand-600 text-white font-black py-2.5 px-6 rounded-2xl flex items-center gap-2 shadow-xl shadow-brand-500/20 transition-all active:scale-95 text-xs uppercase tracking-widest">
          <Plus className="w-4 h-4" /> Nouveau Processus
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-500" /></div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center text-slate-500 italic border-dashed">Aucun processus trouvé.</div>
      ) : (
        <div className="space-y-4">
          <div className="card overflow-hidden bg-slate-900/20 border-slate-800 shadow-2xl">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/50 border-b border-slate-800 text-slate-500 uppercase text-[9px] font-black tracking-[0.2em]">
                <tr className="text-left">
                  <th className="px-6 py-4">Nom du processus</th>
                  <th className="px-6 py-4 text-center">Version</th>
                  <th className="px-6 py-4">Statut</th>
                  <th className="px-6 py-4">Dernière modification</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {paginated.map(w => (
                  <tr key={w.id} className="hover:bg-slate-900/40 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${w.is_active ? 'bg-brand-500/10 text-brand-400' : 'bg-slate-800 text-slate-500'}`}>
                          <GitBranch className="w-4 h-4" />
                        </div>
                        <p className="font-bold text-white group-hover:text-brand-400 transition-colors">{w.name}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 font-mono text-[10px] font-bold">v{w.version}</span>
                    </td>
                    <td className="px-6 py-4">
                      <button onClick={() => handleToggle(w)} className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest ${w.is_active ? 'text-green-500' : 'text-slate-500'}`}>
                        {w.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5 opacity-30" />}
                        {w.is_active ? 'Actif' : 'Désactivé'}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs font-medium italic">
                      {fmtDate(w.updated_at || w.created_at)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setEditingId(w.id)} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-all" title="Éditer le design"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(w.id)} className="p-2 rounded-lg hover:bg-red-900/20 text-slate-400 hover:text-red-400 transition-all" title="Supprimer définitivement"><Trash2 className="w-4 h-4" /></button>
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
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Page {page} sur {totalPages}</p>
              <div className="flex gap-2">
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="p-2 rounded-xl border border-slate-800 text-slate-400 hover:text-white disabled:opacity-20 transition-all"><ChevronLeft className="w-4 h-4" /></button>
                <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="p-2 rounded-xl border border-slate-800 text-slate-400 hover:text-white disabled:opacity-20 transition-all"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page Principale ─────────────────────────────────────────────────────────

export default function DossiersPage() {
  const { business, user } = useAuthStore();
  const { error: notifError, success } = useNotificationStore();

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
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);

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

  const loadStorage = useCallback(async () => {
    if (business) getStorageInfo(business.id).then(setStorageInfo).catch(() => {});
  }, [business]);

  useEffect(() => { load(); loadStorage(); }, [load, loadStorage]);

  const filtered = dossiers.filter(d => !search || d.reference.toLowerCase().includes(search.toLowerCase()) || d.client_name.toLowerCase().includes(search.toLowerCase()));

  const TABS = [
    { id: 'dossiers'    as const, label: 'Dossiers',          icon: <Scale      className="w-4 h-4" /> },
    { id: 'monitoring'  as const, label: 'Suivi',             icon: <Activity   className="w-4 h-4" /> },
    { id: 'workflows'   as const, label: 'Processus',         icon: <GitBranch  className="w-4 h-4" /> },
    { id: 'pretentions' as const, label: 'Modèles juridiques', icon: <BookOpen   className="w-4 h-4" /> },
    { id: 'config'      as const, label: 'Paramètres',        icon: <Settings2   className="w-4 h-4" /> },
  ];

  if (!business) return null;

  return (
    <div className="h-full overflow-y-auto bg-slate-950/20">
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 shadow-glow">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">Gestion des Dossiers</h1>
              <p className="text-slate-500 text-xs font-bold uppercase tracking-[0.1em] mt-0.5">Espace Juridique & Procédures</p>
            </div>
          </div>
          {tab === 'dossiers' && (
            <button onClick={() => setModal('new')} className="bg-brand-500 hover:bg-brand-600 text-white font-black py-3 px-6 rounded-2xl flex items-center gap-2 shadow-xl shadow-brand-500/20 transition-all active:scale-95 text-xs uppercase tracking-widest">
              <Plus className="w-5 h-5" /> Nouveau Dossier
            </button>
          )}
        </div>

        <div className="flex gap-1 p-1 bg-slate-900 border border-slate-800 rounded-2xl w-fit shadow-xl">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${tab === t.id ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/20' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'}`}>{t.icon}{t.label}</button>
          ))}
        </div>

        {tab === 'dossiers' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="relative group">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-brand-400 transition-colors" />
              <input className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-14 pr-6 py-4 text-base text-white placeholder-slate-600 focus:outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500/50 transition-all shadow-inner" placeholder="Rechercher un dossier par référence ou client..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>

            {loading ? <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-purple-400" /></div> : filtered.length === 0 ? (
              <div className="card p-24 text-center space-y-4 border-dashed bg-transparent border-slate-800">
                <Briefcase className="w-12 h-12 text-slate-800 mx-auto" />
                <p className="text-slate-500 font-bold tracking-tight">Aucun dossier trouvé.</p>
              </div>
            ) : (
              <div className="card overflow-hidden bg-slate-900/20 border-slate-800 shadow-2xl">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900/50 border-b border-slate-800 text-slate-500 uppercase text-[9px] font-black tracking-[0.2em]"><tr className="text-left"><th className="px-6 py-4">Référence</th><th className="px-6 py-4">Client</th><th className="px-6 py-4">Contact</th><th className="px-6 py-4">Type d&apos;affaire</th><th className="px-6 py-4 text-center">Status</th><th className="px-6 py-4 text-right">Actions</th></tr></thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {filtered.map(d => (
                      <tr key={d.id} className="hover:bg-slate-900/40 transition-colors group">
                        <td className="px-6 py-4 font-mono text-purple-400 font-bold">{d.reference}</td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-white font-bold tracking-tight">{d.client_name}</span>
                            <span className="text-[10px] text-slate-500 uppercase font-medium">{d.adversaire ? `vs ${d.adversaire}` : ''}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-0.5">
                            {d.client_phone && <span className="text-slate-300 text-xs flex items-center gap-1.5"><Phone className="w-3 h-3 text-brand-400" /> {d.client_phone}</span>}
                            {d.client_email && <span className="text-slate-500 text-[11px] flex items-center gap-1.5"><Mail className="w-3 h-3" /> {d.client_email}</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-400 font-medium">{d.type_affaire}</td>
                        <td className="px-6 py-4 text-center"><StatusBadge status={d.status} statuts={statuts} /></td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => setWorkflowPanel(d)} className="p-2.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-brand-400 transition-all" title="Suivi Processus"><GitBranch className="w-4 h-4" /></button>
                            <button onClick={() => setFichiersPanel(d)} className="p-2.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-purple-400 transition-all" title="Pièces Jointes"><Paperclip className="w-4 h-4" /></button>
                            <button onClick={() => setModal(d)} className="p-2.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-all" title="Modifier Dossier"><Pencil className="w-4 h-4" /></button>
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
        {tab === 'workflows' && <ProcessusManager businessId={business.id} />}
        {tab === 'pretentions' && <PretentionsLibrary businessId={business.id} />}
        {tab === 'config' && <ConfigTab businessId={business.id} onRefresh={load} />}
      </div>

      {modal && <DossierModal initial={modal === 'new' ? null : modal} count={dossiers.length} businessId={business.id} typesAffaire={typesAffaire} tribunaux={tribunaux} statuts={statuts} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
      {workflowPanel && <WorkflowPanel dossier={workflowPanel} businessId={business.id} userId={user?.id} onClose={() => setWorkflowPanel(null)} />}
      {fichiersPanel && <FichiersPanel dossier={fichiersPanel} businessId={business.id} storageInfo={storageInfo} onClose={() => setFichiersPanel(null)} onStorageChange={loadStorage} />}
    </div>
  );
}
