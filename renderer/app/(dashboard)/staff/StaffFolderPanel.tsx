import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X, Loader2, Upload, Trash2, FileText, Download, Lock, LogIn,
  CheckSquare, Square, Settings, Plus, ListChecks,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCan } from '@/hooks/usePermission';
import { useConfirm } from '@/components/shared/ConfirmDialog';
import {
  getStaffDocuments, uploadStaffDocument, deleteStaffDocument, getSignedUrl,
  formatBytes, getFileIcon, STAFF_DOCUMENT_CATEGORY_LABELS,
  type StaffDocument, type StaffDocumentCategory,
} from '@services/supabase/staff-documents';
import {
  getChecklistItems, generateChecklistItems, toggleChecklistItem,
  getChecklistTemplates, createChecklistTemplate, updateChecklistTemplate, deleteChecklistTemplate,
  type StaffChecklistItem, type StaffChecklistTemplate, type ChecklistType,
} from '@services/supabase/staff-checklist';
import type { Staff } from '@services/supabase/staff';

type FolderTab = 'documents' | 'checklist';

export function StaffFolderPanel({
  staff, businessId, onClose, notifError, notifSuccess,
}: {
  staff:       Staff;
  businessId:  string;
  onClose:     () => void;
  notifError:  (m: string) => void;
  notifSuccess: (m: string) => void;
}) {
  const can = useCan();
  const canManage = can('manage_staff_documents');
  const [tab, setTab] = useState<FolderTab>('documents');

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/50" onClick={onClose} />
      <div className="flex flex-col h-full w-full max-w-lg bg-surface-card border-l border-surface-border shadow-xl overflow-hidden animate-in slide-in-from-right duration-300">
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border shrink-0">
          <div>
            <h2 className="font-semibold text-content-primary">Dossier RH — {staff.name}</h2>
            <p className="text-xs text-content-muted">{staff.position ?? 'Poste non défini'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors">
            <X className="w-5 h-5 text-content-secondary" />
          </button>
        </div>

        <div className="flex px-4 bg-surface-card border-b border-surface-border shrink-0">
          {([
            { id: 'documents', label: 'Documents', icon: FileText },
            { id: 'checklist', label: 'Checklist', icon: ListChecks },
          ] as const).map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-wider transition-all relative',
                tab === t.id ? 'text-content-brand' : 'text-content-muted hover:text-content-primary'
              )}>
              <t.icon className="w-4 h-4" />
              {t.label}
              {tab === t.id && <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-brand-500 rounded-t-full" />}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'documents' && (
            <DocumentsPanel staff={staff} businessId={businessId} canManage={canManage} notifError={notifError} notifSuccess={notifSuccess} />
          )}
          {tab === 'checklist' && (
            <ChecklistPanel staff={staff} businessId={businessId} canManage={canManage} notifError={notifError} notifSuccess={notifSuccess} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Documents ────────────────────────────────────────────────────────────────

function DocumentsPanel({
  staff, businessId, canManage, notifError, notifSuccess,
}: {
  staff: Staff; businessId: string; canManage: boolean;
  notifError: (m: string) => void; notifSuccess: (m: string) => void;
}) {
  const [docs, setDocs] = useState<StaffDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState<StaffDocumentCategory>('autre');
  const [confidential, setConfidential] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { askConfirm, ConfirmDialog } = useConfirm();

  const load = useCallback(async () => {
    try { setDocs(await getStaffDocuments(staff.id)); }
    catch (e) { notifError(String(e)); }
    finally { setLoading(false); }
  }, [staff.id, notifError]);

  useEffect(() => { load(); }, [load]);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      await uploadStaffDocument(staff.id, businessId, file, { category, isConfidential: confidential });
      notifSuccess('Document ajouté');
      await load();
    } catch (e) { notifError(String(e)); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function handleDownload(doc: StaffDocument) {
    try {
      const url = await getSignedUrl(doc.storage_path);
      window.open(url, '_blank', 'noopener');
    } catch (e) { notifError(String(e)); }
  }

  function handleDelete(doc: StaffDocument) {
    askConfirm(`Supprimer "${doc.nom}" ?`, async () => {
      try {
        await deleteStaffDocument(doc);
        setDocs((prev) => prev.filter((d) => d.id !== doc.id));
        notifSuccess('Document supprimé');
      } catch (e) { notifError(String(e)); }
    });
  }

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-content-brand" /></div>;

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="bg-surface-input/40 border border-surface-border rounded-xl p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <select value={category} onChange={(e) => setCategory(e.target.value as StaffDocumentCategory)} className="input h-9 text-xs">
              {Object.entries(STAFF_DOCUMENT_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <label className="flex items-center gap-2 text-xs text-content-secondary px-2">
              <input type="checkbox" checked={confidential} onChange={(e) => setConfidential(e.target.checked)} />
              Confidentiel (masqué en self-service)
            </label>
          </div>
          <input ref={fileRef} type="file" className="hidden" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="w-full h-10 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-surface-border text-content-muted hover:text-content-brand hover:border-brand-500 transition-all text-xs font-bold disabled:opacity-60">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Envoi…' : 'Ajouter un document'}
          </button>
        </div>
      )}

      {docs.length === 0 ? (
        <p className="text-center text-content-muted text-sm py-8">Aucun document</p>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center gap-3 bg-surface-input/30 border border-surface-border rounded-xl p-3">
              <span className="text-xl">{getFileIcon(d.mime_type)}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-content-primary truncate">{d.nom}</p>
                <p className="text-[11px] text-content-muted">
                  {STAFF_DOCUMENT_CATEGORY_LABELS[d.category as StaffDocumentCategory] ?? d.category} · {formatBytes(d.taille_bytes)}
                  {d.is_confidential && <span className="inline-flex items-center gap-1 ml-2"><Lock className="w-3 h-3" />Confidentiel</span>}
                </p>
              </div>
              <button onClick={() => handleDownload(d)} className="p-2 text-content-muted hover:text-content-brand rounded-lg transition-colors" title="Ouvrir">
                <Download className="w-4 h-4" />
              </button>
              {canManage && (
                <button onClick={() => handleDelete(d)} className="p-2 text-content-muted hover:text-status-error rounded-lg transition-colors" title="Supprimer">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog />
    </div>
  );
}

// ─── Checklist ────────────────────────────────────────────────────────────────

function ChecklistPanel({
  staff, businessId, canManage, notifError, notifSuccess,
}: {
  staff: Staff; businessId: string; canManage: boolean;
  notifError: (m: string) => void; notifSuccess: (m: string) => void;
}) {
  const availableTypes: ChecklistType[] = staff.status === 'inactive' ? ['onboarding', 'offboarding'] : ['onboarding'];
  const [type, setType] = useState<ChecklistType>(staff.status === 'inactive' ? 'offboarding' : 'onboarding');
  const [items, setItems] = useState<StaffChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTemplates, setShowTemplates] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const generated = await generateChecklistItems(businessId, staff.id, type);
      setItems(generated.length > 0 ? generated : await getChecklistItems(staff.id, type));
    } catch (e) { notifError(String(e)); }
    finally { setLoading(false); }
  }, [businessId, staff.id, type, notifError]);

  useEffect(() => { load(); }, [load]);

  async function handleToggle(item: StaffChecklistItem) {
    const next = !item.is_done;
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, is_done: next } : i));
    try { await toggleChecklistItem(item.id, next); }
    catch (e) { notifError(String(e)); setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, is_done: !next } : i)); }
  }

  const doneCount = items.filter((i) => i.is_done).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex bg-surface-input p-1 rounded-lg border border-surface-border">
          {availableTypes.map((t) => (
            <button key={t} onClick={() => setType(t)}
              className={cn('px-3 py-1.5 rounded-md text-xs font-bold transition-all',
                type === t ? 'bg-brand-600 text-content-primary' : 'text-content-muted hover:text-content-primary')}>
              {t === 'onboarding' ? 'Intégration' : 'Départ'}
            </button>
          ))}
        </div>
        {canManage && (
          <button onClick={() => setShowTemplates(true)} className="p-2 text-content-muted hover:text-content-brand rounded-lg transition-colors" title="Configurer les modèles">
            <Settings className="w-4 h-4" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-content-brand" /></div>
      ) : items.length === 0 ? (
        <p className="text-center text-content-muted text-sm py-8">
          Aucune tâche configurée pour {type === 'onboarding' ? "l'intégration" : 'le départ'}.
          {canManage && ' Configurez un modèle via l\'icône réglages.'}
        </p>
      ) : (
        <>
          <p className="text-[11px] font-bold text-content-muted uppercase tracking-widest">{doneCount} / {items.length} tâches</p>
          <div className="space-y-1.5">
            {items.map((item) => (
              <button key={item.id} onClick={() => canManage && handleToggle(item)} disabled={!canManage}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all',
                  item.is_done ? 'bg-badge-success border-status-success/50' : 'bg-surface-input/30 border-surface-border',
                  !canManage && 'cursor-default'
                )}>
                {item.is_done ? <CheckSquare className="w-4 h-4 text-status-success shrink-0" /> : <Square className="w-4 h-4 text-content-muted shrink-0" />}
                <span className={cn('text-sm', item.is_done ? 'text-content-primary line-through opacity-70' : 'text-content-primary')}>{item.label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {showTemplates && (
        <ChecklistTemplatesModal businessId={businessId} type={type} onClose={() => setShowTemplates(false)} notifError={notifError} notifSuccess={notifSuccess} />
      )}
    </div>
  );
}

function ChecklistTemplatesModal({
  businessId, type, onClose, notifError, notifSuccess,
}: {
  businessId: string; type: ChecklistType; onClose: () => void;
  notifError: (m: string) => void; notifSuccess: (m: string) => void;
}) {
  const [templates, setTemplates] = useState<StaffChecklistTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState('');
  const { askConfirm, ConfirmDialog } = useConfirm();

  const load = useCallback(async () => {
    try { setTemplates(await getChecklistTemplates(businessId, type)); }
    catch (e) { notifError(String(e)); }
    finally { setLoading(false); }
  }, [businessId, type, notifError]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd() {
    if (!newLabel.trim()) return;
    try {
      await createChecklistTemplate({ business_id: businessId, type, label: newLabel.trim(), order_index: templates.length });
      setNewLabel('');
      await load();
    } catch (e) { notifError(String(e)); }
  }

  function handleDelete(t: StaffChecklistTemplate) {
    askConfirm(`Supprimer la tâche modèle "${t.label}" ?`, async () => {
      try { await deleteChecklistTemplate(t.id); notifSuccess('Modèle supprimé'); await load(); }
      catch (e) { notifError(String(e)); }
    });
  }

  async function handleToggleActive(t: StaffChecklistTemplate) {
    try { await updateChecklistTemplate(t.id, { is_active: !t.is_active }); await load(); }
    catch (e) { notifError(String(e)); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-surface-card border border-surface-border rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
          <h3 className="font-bold text-content-primary text-sm">
            Modèle {type === 'onboarding' ? "d'intégration" : 'de départ'}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-hover"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin text-content-brand mx-auto" />
          ) : (
            templates.map((t) => (
              <div key={t.id} className="flex items-center gap-2 bg-surface-input/30 border border-surface-border rounded-lg px-3 py-2">
                <button onClick={() => handleToggleActive(t)} className={cn('text-xs font-bold', t.is_active ? 'text-status-success' : 'text-content-muted')}>
                  {t.is_active ? 'Actif' : 'Inactif'}
                </button>
                <span className="flex-1 text-sm text-content-primary truncate">{t.label}</span>
                <button onClick={() => handleDelete(t)} className="p-1 text-content-muted hover:text-status-error"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))
          )}
          <div className="flex gap-2 pt-2">
            <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="Nouvelle tâche…" className="input flex-1 text-sm h-9" />
            <button onClick={handleAdd} className="h-9 w-9 flex items-center justify-center bg-brand-600 text-content-primary rounded-lg"><Plus className="w-4 h-4" /></button>
          </div>
        </div>
      </div>
      <ConfirmDialog />
    </div>
  );
}
