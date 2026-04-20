'use client';
import { toUserError } from '@/lib/user-error';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Briefcase, Search, Loader2, X, Check, Pencil, Trash2, Phone, Scale, Calendar, Paperclip, Upload, ExternalLink, HardDrive, AlertTriangle, GitBranch, Play, ChevronRight, ChevronDown, PauseCircle, XCircle, CheckCircle2, Clock, Activity, BookOpen } from 'lucide-react';
import { MonitoringDashboard } from '@/components/workflow/MonitoringDashboard';
import { WorkflowBuilder } from '@/components/workflow/WorkflowBuilder';
import { PretentionsLibrary } from '@/components/workflow/PretentionsLibrary';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { supabase } from '@/lib/supabase';
import { canDelete } from '@/lib/permissions';
import { getReferenceData, type RefItem } from '@services/supabase/reference-data';
import {
  getFichiers, uploadFichier, deleteFichier, getSignedUrl, getStorageInfo,
  formatBytes, getFileIcon,
  type DossierFichier, type StorageInfo,
} from '@services/supabase/dossier-fichiers';
import { getInstancesByDossier, getWorkflows } from '@services/supabase/workflows';
import { triggerWorkflow } from '@/lib/workflow-runtime';
import { WorkflowRunner } from '@/components/workflow/WorkflowRunner';
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
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function genRef(count: number) {
  return `DOS-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`;
}

function StatusBadge({ status, statuts }: { status: string; statuts: RefItem[] }) {
  const s = statuts.find((x) => x.value === status);
  const cls = (s?.metadata?.cls as string) ?? 'bg-slate-800 text-slate-400 border-slate-700';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${cls}`}>
      {s?.label ?? status}
    </span>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

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
    client_phone:   initial?.client_phone   ?? '',
    client_email:   initial?.client_email   ?? '',
    adversaire:     initial?.adversaire     ?? '',
    tribunal:       initial?.tribunal       ?? '',
    juge:           initial?.juge           ?? '',
    status:         initial?.status         ?? (statuts[0]?.value ?? 'ouvert'),
    description:    initial?.description    ?? '',
    date_ouverture: initial?.date_ouverture ?? new Date().toISOString().slice(0, 10),
    date_audience:  initial?.date_audience  ?? '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  async function handleSave() {
    if (!form.client_name.trim()) { notifError('Le nom du client est requis'); return; }
    if (!form.reference.trim())   { notifError('La référence est requise'); return; }
    if (form.date_audience && form.date_audience < form.date_ouverture) {
      notifError("La date d'audience ne peut pas être avant la date d'ouverture du dossier");
      return;
    }
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
      const db = supabase.from('dossiers' as never) as ReturnType<typeof supabase.from>;
      let saved: Dossier;
      if (initial) {
        const { data, error } = await db.update(payload as never).eq('id', initial.id).select().single();
        if (error) throw new Error((error as { message: string }).message);
        saved = data as Dossier;
      } else {
        const { data, error } = await db.insert(payload as never).select().single();
        if (error) throw new Error((error as { message: string }).message);
        saved = data as Dossier;
      }
      success(initial ? 'Dossier mis à jour' : 'Dossier créé');
      onSaved(saved);
    } catch (e) { notifError(toUserError(e)); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-surface-card rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b border-surface-border shrink-0">
          <h2 className="text-white font-semibold">
            {initial ? `Modifier — ${initial.reference}` : 'Nouveau dossier'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Référence</label>
              <input className="input" value={form.reference} onChange={(e) => set('reference', e.target.value)} />
            </div>
            <div>
              <label className="label">Type d&apos;affaire</label>
              <select className="input" value={form.type_affaire} onChange={(e) => set('type_affaire', e.target.value)}>
                {typesAffaire.map((t) => (
                  <option key={t.value} value={t.value} className="bg-gray-900 text-white">
                    {(t.metadata?.icon as string) ?? ''} {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Nom du client / mandant <span className="text-red-400">*</span></label>
            <input className="input" value={form.client_name} onChange={(e) => set('client_name', e.target.value)} placeholder="Ex: Mamadou Diallo" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Téléphone</label>
              <input className="input" value={form.client_phone} onChange={(e) => set('client_phone', e.target.value)} placeholder="+221 7X XXX XX XX" />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" value={form.client_email} onChange={(e) => set('client_email', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Adversaire / Partie adverse</label>
              <input className="input" value={form.adversaire} onChange={(e) => set('adversaire', e.target.value)} />
            </div>
            <div>
              <label className="label">Tribunal / Juridiction</label>
              <select className="input" value={form.tribunal} onChange={(e) => set('tribunal', e.target.value)}>
                <option value="" className="bg-gray-900 text-white">— Sélectionner —</option>
                {tribunaux.map((t) => (
                  <option key={t.value} value={t.value} className="bg-gray-900 text-white">{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Juge / Magistrat</label>
              <input className="input" value={form.juge} onChange={(e) => set('juge', e.target.value)} />
            </div>
            <div>
              <label className="label">Statut</label>
              <select className="input" value={form.status} onChange={(e) => set('status', e.target.value)}>
                {statuts.map((s) => (
                  <option key={s.value} value={s.value} className="bg-gray-900 text-white">{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date d&apos;ouverture</label>
              <input type="date" className="input" value={form.date_ouverture} onChange={(e) => set('date_ouverture', e.target.value)} />
            </div>
            <div>
              <label className="label">Prochaine audience</label>
              <input type="date" className="input" value={form.date_audience} onChange={(e) => set('date_audience', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label">Notes / Description</label>
            <textarea className="input resize-none" rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Faits, procédures, notes importantes…" />
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-surface-border shrink-0">
          <button onClick={onClose} className="btn-secondary text-sm">Annuler</button>
          <button onClick={handleSave} disabled={saving || !form.client_name.trim()}
            className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50">
            <Check className="w-4 h-4" />{saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Panneau fichiers ─────────────────────────────────────────────────────────

function FichiersPanel({
  dossier, businessId, storageInfo,
  onClose, onStorageChange,
}: {
  dossier:         Dossier;
  businessId:      string;
  storageInfo:     StorageInfo | null;
  onClose:         () => void;
  onStorageChange: () => void;
}) {
  const { error: notifError, success } = useNotificationStore();
  const [fichiers, setFichiers] = useState<DossierFichier[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);

  useEffect(() => {
    getFichiers(dossier.id)
      .then(setFichiers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [dossier.id]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const f = await uploadFichier(dossier.id, businessId, file, setUploadPct);
        setFichiers((prev) => [f, ...prev]);
      }
      success('Fichier(s) ajouté(s)');
      onStorageChange();
    } catch (e) {
      notifError(e instanceof Error ? e.message : 'Erreur upload');
    } finally {
      setUploading(false);
      setUploadPct(0);
    }
  }

  async function handleOpen(f: DossierFichier) {
    try {
      const url = await getSignedUrl(f.storage_path);
      window.open(url, '_blank');
    } catch { notifError('Impossible d\'ouvrir le fichier'); }
  }

  async function handleDelete(f: DossierFichier) {
    if (!confirm(`Supprimer "${f.nom}" ?`)) return;
    try {
      await deleteFichier(f);
      setFichiers((prev) => prev.filter((x) => x.id !== f.id));
      success('Fichier supprimé');
      onStorageChange();
    } catch (e) { notifError(e instanceof Error ? e.message : 'Erreur'); }
  }

  const quotaPct = storageInfo?.used_pct ?? 0;
  const nearLimit = quotaPct >= 80;

  return (
    <div className="absolute inset-0 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-96 bg-surface-card border-l border-surface-border flex flex-col z-40 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border shrink-0">
        <div>
          <p className="text-sm font-semibold text-white flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-purple-400" />
            Fichiers — {dossier.reference}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">{fichiers.length} fichier{fichiers.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-surface-hover">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Quota bar */}
      {storageInfo && (
        <div className="px-4 py-3 border-b border-surface-border shrink-0 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1 text-slate-400">
              <HardDrive className="w-3 h-3" /> Stockage utilisé
            </span>
            <span className={nearLimit ? 'text-amber-400 font-medium' : 'text-slate-500'}>
              {formatBytes(storageInfo.used_bytes)} / {formatBytes(storageInfo.quota_bytes)}
            </span>
          </div>
          <div className="h-1.5 bg-surface-input rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${nearLimit ? 'bg-amber-500' : 'bg-brand-500'}`}
              style={{ width: `${quotaPct}%` }}
            />
          </div>
          {nearLimit && (
            <p className="text-xs text-amber-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {quotaPct >= 100 ? 'Quota atteint — upgrade nécessaire' : `${100 - quotaPct}% restant`}
            </p>
          )}
        </div>
      )}

      {/* Upload zone */}
      <div className="px-4 py-3 shrink-0">
        <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-4 cursor-pointer transition-colors
          ${uploading ? 'border-brand-600 bg-brand-900/10' : 'border-surface-border hover:border-brand-600 hover:bg-brand-900/10'}`}>
          {uploading ? (
            <>
              <Loader2 className="w-5 h-5 text-brand-400 animate-spin" />
              <span className="text-xs text-brand-400">Upload en cours… {uploadPct}%</span>
            </>
          ) : (
            <>
              <Upload className="w-5 h-5 text-slate-500" />
              <span className="text-xs text-slate-400 text-center">
                Cliquez ou glissez un fichier<br />
                <span className="text-slate-600">Max 50 Mo par fichier</span>
              </span>
            </>
          )}
          <input type="file" className="hidden" multiple disabled={uploading}
            onChange={(e) => handleFiles(e.target.files)} />
        </label>
      </div>

      {/* Liste fichiers */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>
        ) : fichiers.length === 0 ? (
          <p className="text-center text-slate-600 text-sm py-8">Aucun fichier joint</p>
        ) : (
          fichiers.map((f) => (
            <div key={f.id} className="flex items-center gap-3 p-3 rounded-xl bg-surface-input hover:bg-surface-hover transition-colors group">
              <span className="text-xl shrink-0">{getFileIcon(f.mime_type)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{f.nom}</p>
                <p className="text-xs text-slate-500">{formatBytes(f.taille_bytes)}</p>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => handleOpen(f)}
                  className="p-1.5 text-slate-400 hover:text-brand-400 rounded-lg hover:bg-surface-card" title="Ouvrir">
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleDelete(f)}
                  className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-red-900/20" title="Supprimer">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Gestionnaire de workflows ────────────────────────────────────────────────

function WorkflowsManager({ businessId }: { businessId: string }) {
  const [workflows, setWorkflows]   = useState<Workflow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [editingId, setEditingId]   = useState<string | 'new' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setWorkflows(await getWorkflows(businessId)); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [businessId]);

  useEffect(() => { load(); }, [load]);

  const selected = editingId === 'new' ? null : workflows.find(w => w.id === editingId) ?? null;

  if (editingId !== null) {
    return (
      <div className="space-y-3">
        <button
          onClick={() => { setEditingId(null); load(); }}
          className="text-sm text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
        >
          ← Retour aux workflows
        </button>
        <WorkflowBuilder
          businessId={businessId}
          workflowId={selected?.id}
          initialName={selected?.name}
          initialDef={selected?.definition}
          onSaved={() => { setEditingId(null); load(); }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{workflows.length} workflow{workflows.length !== 1 ? 's' : ''} configurés</p>
        <button onClick={() => setEditingId('new')} className="btn-primary flex items-center gap-2 text-sm py-2 px-3">
          <Plus className="w-4 h-4" />
          Nouveau workflow
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>
      ) : workflows.length === 0 ? (
        <div className="text-center py-14 space-y-3">
          <GitBranch className="w-10 h-10 text-slate-700 mx-auto" />
          <p className="text-slate-500 text-sm">Aucun workflow — créez votre premier processus automatisé</p>
          <button onClick={() => setEditingId('new')} className="btn-primary text-sm py-2 px-4">
            Créer un workflow
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
          {workflows.map(w => (
            <div key={w.id} className="card p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white truncate">{w.name}</p>
                  {w.description && <p className="text-xs text-slate-500 truncate mt-0.5">{w.description}</p>}
                </div>
                <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium border ${w.is_active ? 'text-green-300 bg-green-900/20 border-green-800' : 'text-slate-500 bg-slate-800 border-slate-700'}`}>
                  {w.is_active ? 'Actif' : 'Inactif'}
                </span>
              </div>
              <p className="text-xs text-slate-600">
                {w.definition.nodes.length} nœuds · {w.definition.edges.length} transitions · v{w.version}
              </p>
              <button
                onClick={() => setEditingId(w.id)}
                className="w-full btn-secondary text-xs py-1.5 flex items-center justify-center gap-1.5"
              >
                <Pencil className="w-3.5 h-3.5" />
                Éditer
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Badges statut workflow ────────────────────────────────────────────────────

const WF_STATUS: Record<WorkflowStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  PENDING:   { label: 'En attente',  cls: 'text-slate-400 border-slate-700 bg-slate-800',        icon: <Clock       className="w-3 h-3" /> },
  RUNNING:   { label: 'En cours',    cls: 'text-blue-300 border-blue-800 bg-blue-900/20',         icon: <Loader2     className="w-3 h-3 animate-spin" /> },
  WAITING:   { label: 'Action req.', cls: 'text-amber-300 border-amber-800 bg-amber-900/20',      icon: <Clock       className="w-3 h-3" /> },
  PAUSED:    { label: 'En pause',    cls: 'text-purple-300 border-purple-800 bg-purple-900/20',   icon: <PauseCircle className="w-3 h-3" /> },
  COMPLETED: { label: 'Terminé',     cls: 'text-green-300 border-green-800 bg-green-900/20',      icon: <CheckCircle2 className="w-3 h-3" /> },
  FAILED:    { label: 'Échoué',      cls: 'text-red-400 border-red-800 bg-red-900/20',            icon: <XCircle     className="w-3 h-3" /> },
  CANCELLED: { label: 'Annulé',      cls: 'text-red-500 border-red-900 bg-red-950/20',            icon: <XCircle     className="w-3 h-3" /> },
};

function WfStatusBadge({ status }: { status: WorkflowStatus }) {
  const { label, cls, icon } = WF_STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${cls}`}>
      {icon}{label}
    </span>
  );
}

// ─── Panneau workflows ─────────────────────────────────────────────────────────

function WorkflowPanel({
  dossier, businessId, userId, onClose,
}: {
  dossier: Dossier; businessId: string; userId?: string; onClose: () => void;
}) {
  const [instances, setInstances]   = useState<WorkflowInstance[]>([]);
  const [workflows, setWorkflows]   = useState<Workflow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [triggering, setTriggering] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getInstancesByDossier(dossier.id),
      getWorkflows(businessId),
    ]).then(([inst, wf]) => {
      setInstances(inst);
      setWorkflows(wf.filter(w => w.is_active));
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, [dossier.id, businessId]);

  const handleTrigger = async (wf: Workflow) => {
    setTriggering(wf.id);
    setShowPicker(false);
    try {
      const res = await triggerWorkflow({
        workflow_id:     wf.id,
        dossier_id:      dossier.id,
        triggered_by:    'MANUAL',
        started_by:      userId,
        initial_context: {
          dossier_id:    dossier.id,
          reference:     dossier.reference,
          client_name:   dossier.client_name,
          'client.phone': dossier.client_phone,
          'client.email': dossier.client_email,
        },
      });
      if (!res.ok) throw new Error(res.error);
      // Recharger les instances
      const updated = await getInstancesByDossier(dossier.id);
      setInstances(updated);
      // Ouvrir automatiquement la nouvelle instance
      if (updated.length > 0) setExpanded(updated[0].id);
    } catch (e) {
      console.error(e);
    } finally {
      setTriggering(null);
    }
  };

  const handleTransition = (instanceId: string, nodeId: string, status: WorkflowStatus) => {
    setInstances(prev =>
      prev.map(i => i.id === instanceId ? { ...i, current_node_id: nodeId, status } : i)
    );
  };

  const activeInstances   = instances.filter(i => !['COMPLETED','CANCELLED'].includes(i.status));
  const archiveInstances  = instances.filter(i =>  ['COMPLETED','CANCELLED'].includes(i.status));

  return (
    <div
      className="absolute inset-0 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[440px] bg-surface-card border-l border-surface-border flex flex-col z-40 shadow-2xl"
      onClick={() => setShowPicker(false)}
    >

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border shrink-0">
        <div>
          <p className="text-sm font-semibold text-white flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-brand-400" />
            Workflows — {dossier.reference}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {activeInstances.length} actif{activeInstances.length !== 1 ? 's' : ''}
            {archiveInstances.length > 0 && ` · ${archiveInstances.length} archivé${archiveInstances.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Bouton démarrer */}
          <div className="relative">
            <button
              onClick={() => setShowPicker(p => !p)}
              disabled={!!triggering || workflows.length === 0}
              className="flex items-center gap-1.5 text-xs btn-primary py-1.5 px-3 disabled:opacity-50"
            >
              {triggering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              Démarrer
            </button>
            {showPicker && (
              <div
                className="absolute right-0 top-full mt-1 w-64 bg-surface-card border border-surface-border rounded-xl shadow-xl z-50 overflow-hidden"
                onClick={e => e.stopPropagation()}
              >
                {workflows.map(wf => (
                  <button
                    key={wf.id}
                    onClick={() => handleTrigger(wf)}
                    className="w-full text-left px-4 py-3 hover:bg-surface-hover transition-colors border-b border-surface-border last:border-0"
                  >
                    <p className="text-sm text-white font-medium truncate">{wf.name}</p>
                    {wf.description && <p className="text-xs text-slate-500 truncate mt-0.5">{wf.description}</p>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-surface-hover">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Contenu */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
          </div>
        ) : instances.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <GitBranch className="w-8 h-8 text-slate-700 mx-auto" />
            <p className="text-sm text-slate-500">Aucun workflow actif</p>
            <p className="text-xs text-slate-600">
              {workflows.length === 0
                ? 'Aucun workflow disponible — créez-en un dans la section Workflows'
                : 'Cliquez sur "Démarrer" pour lancer un processus'}
            </p>
          </div>
        ) : (
          <>
            {/* Actifs */}
            {activeInstances.map(inst => (
              <div key={inst.id} className="card overflow-hidden">
                <button
                  onClick={() => setExpanded(e => e === inst.id ? null : inst.id)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-hover transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <WfStatusBadge status={inst.status} />
                    <span className="text-xs text-slate-400 font-mono truncate">
                      {inst.id.slice(0, 8)}…
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-slate-500">
                      {new Date(inst.started_at).toLocaleDateString('fr-FR')}
                    </span>
                    {expanded === inst.id
                      ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                      : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />}
                  </div>
                </button>
                {expanded === inst.id && (
                  <div className="border-t border-surface-border p-3">
                    <WorkflowRunner
                      instance={inst}
                      currentUserId={userId}
                      onTransition={(nodeId, status) => handleTransition(inst.id, nodeId, status)}
                      onCancel={() => handleTransition(inst.id, inst.current_node_id, 'CANCELLED')}
                    />
                  </div>
                )}
              </div>
            ))}

            {/* Archives */}
            {archiveInstances.length > 0 && (
              <div className="space-y-2 pt-2">
                <p className="text-xs text-slate-600 uppercase tracking-wide font-medium px-1">Archivés</p>
                {archiveInstances.map(inst => (
                  <div key={inst.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface-input">
                    <WfStatusBadge status={inst.status} />
                    <span className="text-xs text-slate-500 font-mono flex-1 truncate">{inst.id.slice(0, 8)}…</span>
                    <span className="text-xs text-slate-600">
                      {inst.completed_at
                        ? new Date(inst.completed_at).toLocaleDateString('fr-FR')
                        : new Date(inst.started_at).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DossiersPage() {
  const { business, user } = useAuthStore();
  const { error: notifError, success } = useNotificationStore();

  const [dossiers, setDossiers]         = useState<Dossier[]>([]);
  const [typesAffaire, setTypesAffaire] = useState<RefItem[]>([]);
  const [tribunaux, setTribunaux]       = useState<RefItem[]>([]);
  const [statuts, setStatuts]           = useState<RefItem[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [filterStatus, setFilterStatus] = useState('tous');
  const [filterType, setFilterType]     = useState('tous');
  const [modal, setModal]               = useState<'new' | Dossier | null>(null);
  const [deletingId, setDeletingId]     = useState<string | null>(null);
  const [tab, setTab]                       = useState<'dossiers' | 'monitoring' | 'workflows' | 'pretentions'>('dossiers');
  const [fichiersPanel, setFichiersPanel]   = useState<Dossier | null>(null);
  const [workflowPanel, setWorkflowPanel]   = useState<Dossier | null>(null);
  const [storageInfo, setStorageInfo]       = useState<StorageInfo | null>(null);

  const load = useCallback(async () => {
    if (!business) return;
    setLoading(true);
    try {
      const [d, ta, tr, st] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('dossiers').select('*').eq('business_id', business.id).order('created_at', { ascending: false }),
        getReferenceData('type_affaire',   business.id),
        getReferenceData('tribunal',       business.id),
        getReferenceData('statut_dossier', business.id),
      ]);
      if (d.error) throw new Error(d.error.message);
      setDossiers(d.data ?? []);
      setTypesAffaire(ta);
      setTribunaux(tr);
      setStatuts(st);
    } catch (e) { notifError(toUserError(e)); }
    finally { setLoading(false); }
  }, [business, notifError]);

  const loadStorage = useCallback(async () => {
    if (!business) return;
    try { setStorageInfo(await getStorageInfo(business.id)); } catch { /* silencieux */ }
  }, [business]);

  useEffect(() => { load(); loadStorage(); }, [load, loadStorage]);

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce dossier ?')) return;
    setDeletingId(id);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('dossiers').delete().eq('id', id);
      if (error) throw new Error(error.message);
      success('Dossier supprimé');
      setDossiers((prev) => prev.filter((d) => d.id !== id));
    } catch (e) { notifError(toUserError(e)); }
    finally { setDeletingId(null); }
  }

  const filtered = dossiers.filter((d) => {
    if (filterStatus !== 'tous' && d.status !== filterStatus) return false;
    if (filterType !== 'tous'   && d.type_affaire !== filterType) return false;
    if (search) {
      const q = search.toLowerCase();
      return d.reference.toLowerCase().includes(q) ||
        d.client_name.toLowerCase().includes(q) ||
        (d.adversaire ?? '').toLowerCase().includes(q) ||
        (d.tribunal ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  const today = new Date().toISOString().slice(0, 10);
  const stats = {
    total:    dossiers.length,
    actifs:   dossiers.filter((d) => ['ouvert','en_cours','plaidé'].includes(d.status)).length,
    gagnés:   dossiers.filter((d) => d.status === 'gagné').length,
    audience: dossiers.filter((d) => d.date_audience && d.date_audience >= today).length,
  };

  const TABS = [
    { id: 'dossiers'    as const, label: 'Dossiers',    icon: <Scale      className="w-4 h-4" /> },
    { id: 'monitoring'  as const, label: 'Monitoring',  icon: <Activity   className="w-4 h-4" /> },
    { id: 'workflows'   as const, label: 'Workflows',   icon: <GitBranch  className="w-4 h-4" /> },
    { id: 'pretentions' as const, label: 'Prétentions', icon: <BookOpen   className="w-4 h-4" /> },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">

        {/* ── En-tête ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Scale className="w-5 h-5 text-purple-400" /> Dossiers & Affaires
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">Gestion des affaires judiciaires et clients</p>
          </div>
          {tab === 'dossiers' && (
            <button onClick={() => setModal('new')} className="btn-primary flex items-center gap-2 text-sm">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Nouveau dossier</span>
            </button>
          )}
        </div>

        {/* ── Onglets ── */}
        <div className="flex gap-1 p-1 bg-surface-card rounded-xl border border-surface-border w-fit">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t.id
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-surface-hover'
              }`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* ── Onglet Dossiers ── */}
        {tab === 'dossiers' && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Total',             value: stats.total,    cls: 'text-slate-300' },
                { label: 'Actifs',            value: stats.actifs,   cls: 'text-amber-400' },
                { label: 'Gagnés',            value: stats.gagnés,   cls: 'text-green-400' },
                { label: 'Audiences à venir', value: stats.audience, cls: 'text-purple-400' },
              ].map((s) => (
                <div key={s.label} className="card p-4">
                  <p className={`text-2xl font-bold ${s.cls}`}>{s.value}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Référence, client, adversaire…" className="input pl-9 text-sm" />
              </div>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input text-sm w-auto">
                <option value="tous" className="bg-gray-900 text-white">Tous les statuts</option>
                {statuts.map((s) => <option key={s.value} value={s.value} className="bg-gray-900 text-white">{s.label}</option>)}
              </select>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="input text-sm w-auto">
                <option value="tous" className="bg-gray-900 text-white">Tous les types</option>
                {typesAffaire.map((t) => (
                  <option key={t.value} value={t.value} className="bg-gray-900 text-white">
                    {(t.metadata?.icon as string) ?? ''} {t.label}
                  </option>
                ))}
              </select>
            </div>

            {loading ? (
              <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-purple-400" /></div>
            ) : filtered.length === 0 ? (
              <div className="card p-12 text-center">
                <Briefcase className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                <p className="text-slate-400">Aucun dossier trouvé</p>
              </div>
            ) : (
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[900px]">
                    <thead className="border-b border-surface-border">
                      <tr className="text-xs text-slate-400 uppercase tracking-wider">
                        <th className="text-left px-4 py-3">Référence</th>
                        <th className="text-left px-4 py-3">Type</th>
                        <th className="text-left px-4 py-3">Client</th>
                        <th className="text-left px-4 py-3">Adversaire</th>
                        <th className="text-left px-4 py-3">Tribunal</th>
                        <th className="text-left px-4 py-3">Audience</th>
                        <th className="text-left px-4 py-3">Statut</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border">
                      {filtered.map((d) => {
                        const typeInfo    = typesAffaire.find((t) => t.value === d.type_affaire);
                        const tribunalLbl = tribunaux.find((t) => t.value === d.tribunal)?.label ?? d.tribunal;
                        const audiencePassed = d.date_audience && d.date_audience < today;
                        const audienceSoon   = d.date_audience && !audiencePassed &&
                          (new Date(d.date_audience).getTime() - Date.now()) < 7 * 86400000;
                        return (
                          <tr key={d.id} className="hover:bg-surface-input/40 transition-colors">
                            <td className="px-4 py-3 font-mono text-xs text-purple-300 font-semibold">{d.reference}</td>
                            <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                              {(typeInfo?.metadata?.icon as string) ?? ''} {typeInfo?.label ?? d.type_affaire}
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-white font-medium">{d.client_name}</p>
                              {d.client_phone && (
                                <p className="text-xs text-slate-500 flex items-center gap-1">
                                  <Phone className="w-3 h-3" />{d.client_phone}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-400">{d.adversaire ?? '—'}</td>
                            <td className="px-4 py-3 text-slate-400 text-xs max-w-[150px] truncate">{tribunalLbl ?? '—'}</td>
                            <td className="px-4 py-3">
                              {d.date_audience ? (
                                <span className={`text-xs flex items-center gap-1 ${audiencePassed ? 'text-slate-600' : audienceSoon ? 'text-amber-400 font-medium' : 'text-slate-300'}`}>
                                  <Calendar className="w-3 h-3" />{fmtDate(d.date_audience)}
                                </span>
                              ) : <span className="text-slate-600 text-xs">—</span>}
                            </td>
                            <td className="px-4 py-3"><StatusBadge status={d.status} statuts={statuts} /></td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1 justify-end">
                                <button onClick={() => setWorkflowPanel(d)} title="Workflows"
                                  className="p-1.5 text-slate-500 hover:text-brand-400 rounded-lg hover:bg-surface-input transition-colors">
                                  <GitBranch className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => setFichiersPanel(d)} title="Fichiers joints"
                                  className="p-1.5 text-slate-500 hover:text-purple-400 rounded-lg hover:bg-surface-input transition-colors">
                                  <Paperclip className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => setModal(d)}
                                  className="p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-surface-input transition-colors">
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                {canDelete(user?.role ?? 'staff') && (
                                  <button onClick={() => handleDelete(d.id)} disabled={deletingId === d.id}
                                    className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-red-900/20 transition-colors disabled:opacity-40">
                                    <Trash2 className="w-3.5 h-3.5" />
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
            )}
          </>
        )}

        {/* ── Onglet Monitoring ── */}
        {tab === 'monitoring' && business?.id && (
          <MonitoringDashboard businessId={business.id} />
        )}

        {/* ── Onglet Workflows ── */}
        {tab === 'workflows' && business?.id && (
          <WorkflowsManager businessId={business.id} />
        )}

        {/* ── Onglet Prétentions ── */}
        {tab === 'pretentions' && business?.id && (
          <PretentionsLibrary businessId={business.id} />
        )}

      </div>

      {/* ── Modals & panneaux ── */}
      {modal && (
        <DossierModal
          initial={modal === 'new' ? null : modal}
          count={dossiers.length}
          businessId={business?.id ?? ''}
          typesAffaire={typesAffaire}
          tribunaux={tribunaux}
          statuts={statuts}
          onClose={() => setModal(null)}
          onSaved={(dossier) => {
            setModal(null);
            load();
            if (!modal || modal === 'new') setFichiersPanel(dossier);
          }}
        />
      )}

      {fichiersPanel && (
        <FichiersPanel
          dossier={fichiersPanel}
          businessId={business?.id ?? ''}
          storageInfo={storageInfo}
          onClose={() => setFichiersPanel(null)}
          onStorageChange={loadStorage}
        />
      )}

      {workflowPanel && (
        <WorkflowPanel
          dossier={workflowPanel}
          businessId={business?.id ?? ''}
          userId={user?.id}
          onClose={() => setWorkflowPanel(null)}
        />
      )}
    </div>
  );
}
