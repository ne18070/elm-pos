import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Search, Plus, Upload, Loader2, GitBranch, History, Download, 
  Pencil, Trash2, ToggleRight, ToggleLeft, ChevronLeft, ChevronRight, X 
} from 'lucide-react';
import { useNotificationStore } from '@/store/notifications';
import { 
  getWorkflows, deleteWorkflow, toggleWorkflowStatus, saveWorkflow, 
  getWorkflowVersions, type WorkflowVersion 
} from '@services/supabase/workflows';
import { toUserError } from '@/lib/user-error';
import { WorkflowBuilder } from '@/components/workflow/WorkflowBuilder';
import { ConfirmModal } from '@/components/ui/Modal';
import { fmtDate } from './dossier-utils';
import type { Workflow } from '@pos-types';

export function ProcessusManager({ businessId, isOwnerOrAdmin, userId }: { businessId: string; isOwnerOrAdmin: boolean; userId?: string }) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [historyWf, setHistoryWf] = useState<Workflow | null>(null);
  const [versions, setVersions] = useState<WorkflowVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const { error: notifError, success } = useNotificationStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<WorkflowVersion | null>(null);

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
    try {
      await saveWorkflow(businessId, v.definition, historyWf!.name, historyWf!.description ?? undefined, historyWf!.id, userId);
      success('Version restaurée');
      setConfirmRestore(null);
      setHistoryWf(null);
      load();
    } catch (e) { notifError(String(e)); }
  };

  const handleDelete = async (id: string) => {
    if (!isOwnerOrAdmin) return;
    try {
      await deleteWorkflow(id);
      success('Processus supprimé');
      setConfirmDelete(null);
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
                            <button onClick={() => setConfirmDelete(w.id)} className="p-2 rounded-lg hover:bg-badge-error text-content-secondary hover:text-status-error transition-all" title="Supprimer définitivement"><Trash2 className="w-4 h-4" /></button>
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
                          onClick={() => setConfirmRestore(v)}
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

      {confirmDelete && (
        <ConfirmModal
          title="Supprimer le processus ?"
          message="Voulez-vous supprimer ce processus définitivement ? Cette action est irréversible et pourrait affecter l'historique d'audit."
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
          type="danger"
        />
      )}

      {confirmRestore && (
        <ConfirmModal
          title="Restaurer la version ?"
          message={`Voulez-vous restaurer la version ${confirmRestore.version} ? Cela créera une nouvelle version basée sur celle-ci.`}
          onConfirm={() => handleRestore(confirmRestore)}
          onCancel={() => setConfirmRestore(null)}
        />
      )}
    </div>
  );
}
