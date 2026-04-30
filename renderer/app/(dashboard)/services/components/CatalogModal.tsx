import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useNotificationStore } from '@/store/notifications';
import { toUserError } from '@/lib/user-error';
import { 
  upsertServiceCatalogItem, 
  getServiceCategories, 
  type ServiceCatalogItem, 
  type ServiceCategory 
} from '@services/supabase/service-orders';

export function CatalogModal({ businessId, item, onClose, onSaved }: {
  businessId: string; item?: ServiceCatalogItem; onClose: () => void; onSaved: () => void;
}) {
  const { error: notifError } = useNotificationStore();
  const [name,        setName]        = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [categoryId,  setCategoryId]  = useState<string | null>(item?.category_id ?? null);
  const [price,       setPrice]       = useState(String(item?.price ?? ''));
  const [duration,    setDuration]    = useState(String(item?.duration_min ?? ''));
  const [saving,      setSaving]      = useState(false);
  const [categories,  setCategories]  = useState<ServiceCategory[]>([]);

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
        description:  description.trim() || null,
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
            <label className="text-xs text-content-secondary font-medium mb-1 block">Description <span className="text-content-muted font-normal">(optionnel — visible sur la page publique)</span></label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              placeholder="ex: Inclut nettoyage intérieur et extérieur…"
              className="w-full px-3 py-2 rounded-xl bg-surface-input border border-surface-border text-content-primary text-sm resize-none" />
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
