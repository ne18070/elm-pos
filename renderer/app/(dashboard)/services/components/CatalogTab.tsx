import React, { useState, useMemo } from 'react';
import { Package2, LayoutGrid, Pencil, Trash2, Plus, Power, PowerOff } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useNotificationStore } from '@/store/notifications';
import { toUserError } from '@/lib/user-error';
import { 
  upsertServiceCategory, 
  deleteServiceCategory, 
  deleteServiceCatalogItem, 
  toggleServiceCatalogItem,
  type ServiceCatalogItem,
  type ServiceCategory
} from '@services/supabase/service-orders';
import { useServiceCatalog } from '../hooks/useServiceCatalog';
import { CatalogModal } from './CatalogModal';
import { ConfirmModal } from '@/components/ui/Modal';

export function CatalogTab({ 
  businessId, 
  canManageCatalog,
  currency 
}: { 
  businessId: string; 
  canManageCatalog: boolean;
  currency: string;
}) {
  const { 
    allCatalog, 
    categories, 
    loading, 
    refresh,
    setCategories,
    setAllCatalog
  } = useServiceCatalog(businessId);
  
  const { success, error: notifError } = useNotificationStore();
  const [selectedCatalogCat, setSelectedCatalogCat] = useState<string | null | '__all__'>('__all__');
  const [catalogModal, setCatalogModal] = useState<{ item?: ServiceCatalogItem } | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState('');
  
  const [confirmDelete, setConfirmConfirmDelete] = useState<{ type: 'category' | 'item'; id: string; name: string } | null>(null);

  const filteredCatalogItems = useMemo(() => {
    if (selectedCatalogCat === '__all__') return allCatalog;
    if (selectedCatalogCat === null) return allCatalog.filter(i => !i.category_id);
    return allCatalog.filter(i => i.category_id === selectedCatalogCat);
  }, [allCatalog, selectedCatalogCat]);

  async function handleAddCategory() {
    if (!newCatName.trim()) return;
    try {
      await upsertServiceCategory(businessId, { name: newCatName.trim() });
      setNewCatName('');
      refresh();
    } catch (e: any) { notifError(toUserError(e)); }
  }

  async function handleDeleteCategory(id: string) {
    try {
      await deleteServiceCategory(id);
      if (selectedCatalogCat === id) setSelectedCatalogCat('__all__');
      refresh();
      success('Catégorie supprimée');
    } catch (e: any) { notifError(toUserError(e)); }
  }

  async function handleRenameCategory(id: string, name: string) {
    setEditingCatId(null);
    if (!name.trim()) return;
    const cat = categories.find(c => c.id === id);
    if (!cat || name.trim() === cat.name) return;
    try {
      await upsertServiceCategory(businessId, { id, name: name.trim(), color: cat.color, sort_order: cat.sort_order });
      refresh();
    } catch (e: any) { notifError(toUserError(e)); }
  }

  async function deleteCatalogItem(id: string) {
    try { 
      await deleteServiceCatalogItem(id); 
      refresh(); 
      success('Prestation supprimée'); 
    }
    catch (e: any) { notifError(toUserError(e)); }
  }

  async function toggleCatalog(id: string, active: boolean) {
    if (!canManageCatalog) return;
    try { 
      await toggleServiceCatalogItem(id, active); 
      refresh(); 
    }
    catch (e: any) { notifError(toUserError(e)); }
  }

  return (
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
            {categories.map(cat => {
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
                        onClick={e => { e.stopPropagation(); setConfirmConfirmDelete({ type: 'category', id: cat.id, name: cat.name }); }}
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
            <h2 className="font-bold text-content-primary text-sm sm:text-base truncate">
              {selectedCatalogCat === '__all__'
                ? 'Toutes les prestations'
                : selectedCatalogCat === null
                  ? 'Sans catégorie'
                  : (categories.find(c => c.id === selectedCatalogCat)?.name ?? 'Prestations')}
              <span className="ml-2 text-xs font-normal text-content-secondary">({filteredCatalogItems.length})</span>
            </h2>
            {canManageCatalog && (
              <button onClick={() => setCatalogModal({})}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-brand-500/15 hover:bg-brand-500/25 text-content-brand text-xs font-medium shrink-0">
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
            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
                {filteredCatalogItems.map(item => (
                    <div key={item.id} className="group flex items-center gap-3 p-3 rounded-xl border border-surface-border hover:border-brand-500/30 transition-all bg-surface-card">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <p className="font-semibold text-content-primary text-sm truncate">{item.name}</p>
                                {!item.is_active && <span className="text-[10px] font-bold text-content-muted bg-surface-hover px-1.5 py-0.5 rounded uppercase">Inactif</span>}
                            </div>
                            {item.description && <p className="text-xs text-content-secondary truncate">{item.description}</p>}
                        </div>
                        <div className="text-right shrink-0">
                            <p className="font-bold text-content-primary text-sm">{formatCurrency(item.price, currency)}</p>
                            {item.duration_min && <p className="text-[10px] text-content-secondary">{item.duration_min} min</p>}
                        </div>
                        {canManageCatalog && (
                            <div className="flex items-center gap-1 ml-2">
                                <button onClick={() => setCatalogModal({ item })} className="p-1.5 rounded-lg hover:bg-surface-hover text-content-secondary transition-colors" title="Modifier">
                                    <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => toggleCatalog(item.id, !item.is_active)} className={cn("p-1.5 rounded-lg transition-colors", item.is_active ? "hover:bg-red-500/10 text-content-secondary hover:text-status-error" : "hover:bg-green-500/10 text-status-success")} title={item.is_active ? "Désactiver" : "Activer"}>
                                    {item.is_active ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                                </button>
                                <button onClick={() => setConfirmConfirmDelete({ type: 'item', id: item.id, name: item.name })} className="p-1.5 rounded-lg hover:bg-red-500/20 text-content-secondary hover:text-status-error transition-colors" title="Supprimer">
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {catalogModal && (
        <CatalogModal
          businessId={businessId}
          item={catalogModal.item}
          onClose={() => setCatalogModal(null)}
          onSaved={() => { setCatalogModal(null); refresh(); }}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title={confirmDelete.type === 'category' ? "Supprimer la catégorie" : "Supprimer la prestation"}
          message={confirmDelete.type === 'category' 
            ? `Voulez-vous vraiment supprimer la catégorie "${confirmDelete.name}" ? Les prestations associées ne seront pas supprimées.`
            : `Voulez-vous vraiment supprimer la prestation "${confirmDelete.name}" ?`
          }
          confirmLabel="Supprimer"
          type="danger"
          onConfirm={() => {
            if (confirmDelete.type === 'category') handleDeleteCategory(confirmDelete.id);
            else deleteCatalogItem(confirmDelete.id);
            setConfirmConfirmDelete(null);
          }}
          onCancel={() => setConfirmConfirmDelete(null)}
        />
      )}
    </div>
  );
}
