import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { getReferenceData, upsertRefItem, deleteRefItem, type RefItem } from '@services/supabase/reference-data';
import { useNotificationStore } from '@/store/notifications';
import { ConfirmModal } from '@/components/ui/Modal';

export function ConfigTab({ businessId, onRefresh }: { businessId: string, onRefresh: () => void }) {
  const [category, setCategory] = useState<'type_affaire' | 'tribunal' | 'statut_dossier' | 'type_client'>('type_affaire');
  const [items, setItems] = useState<RefItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<RefItem> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
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
    try {
      await deleteRefItem(id);
      success('Supprimé');
      setConfirmDelete(null);
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
                    <button onClick={() => setConfirmDelete(item.id)} className="p-2 rounded-lg hover:bg-badge-error text-content-secondary hover:text-status-error"><Trash2 className="w-4 h-4" /></button>
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

      {confirmDelete && (
        <ConfirmModal
          title="Supprimer l'élément ?"
          message="Cette action est irréversible. L'élément ne sera plus disponible pour les nouveaux dossiers."
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
          type="danger"
        />
      )}
    </div>
  );
}
