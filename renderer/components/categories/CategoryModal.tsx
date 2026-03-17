'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useNotificationStore } from '@/store/notifications';
import { createCategory, updateCategory } from '@services/supabase/products';
import type { Category } from '@pos-types';

interface CategoryModalProps {
  category: Category | null;
  businessId: string;
  onClose: () => void;
  onSaved: () => void;
}

const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#64748b',
];

const ICONS = ['🛒', '🍕', '☕', '🥤', '🍰', '👕', '💊', '📦', '🔧', '✨'];

export function CategoryModal({ category, businessId, onClose, onSaved }: CategoryModalProps) {
  const isEdit = !!category;
  const { success, error: notifError } = useNotificationStore();
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name:       category?.name ?? '',
    color:      category?.color ?? COLORS[0],
    icon:       category?.icon ?? '',
    sort_order: String(category?.sort_order ?? 0),
  });

  function update(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setLoading(true);
    try {
      const payload = {
        business_id: businessId,
        name:        form.name.trim(),
        color:       form.color || undefined,
        icon:        form.icon || undefined,
        sort_order:  parseInt(form.sort_order) || 0,
      };

      if (isEdit) {
        await updateCategory(category.id, payload);
        success('Catégorie mise à jour');
      } else {
        await createCategory(payload);
        success('Catégorie créée');
      }
      onSaved();
    } catch (err) {
      notifError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title={isEdit ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary px-5">Annuler</button>
          <button
            onClick={handleSave}
            disabled={loading || !form.name.trim()}
            className="btn-primary px-5 flex items-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdit ? 'Enregistrer' : 'Créer'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Nom */}
        <div>
          <label className="label">Nom *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            className="input"
            placeholder="Ex: Boissons"
            autoFocus
          />
        </div>

        {/* Icône */}
        <div>
          <label className="label">Icône</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {ICONS.map((icon) => (
              <button
                key={icon}
                onClick={() => update('icon', form.icon === icon ? '' : icon)}
                className={`w-10 h-10 text-xl rounded-xl border transition-all
                  ${form.icon === icon
                    ? 'border-brand-500 bg-brand-900/30'
                    : 'border-surface-border hover:border-slate-500'}`}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>

        {/* Couleur */}
        <div>
          <label className="label">Couleur</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {COLORS.map((color) => (
              <button
                key={color}
                onClick={() => update('color', color)}
                style={{ backgroundColor: color }}
                className={`w-8 h-8 rounded-full border-2 transition-all
                  ${form.color === color ? 'border-white scale-110' : 'border-transparent'}`}
              />
            ))}
          </div>
        </div>

        {/* Aperçu */}
        {form.name && (
          <div>
            <label className="label">Aperçu</label>
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium text-white"
              style={{ backgroundColor: form.color + '33', border: `1px solid ${form.color}66` }}
            >
              {form.icon && <span>{form.icon}</span>}
              <span style={{ color: form.color }}>{form.name}</span>
            </div>
          </div>
        )}

        {/* Ordre */}
        <div>
          <label className="label">Ordre d'affichage</label>
          <input
            type="number"
            value={form.sort_order}
            onChange={(e) => update('sort_order', e.target.value)}
            className="input w-24"
            min="0"
          />
        </div>
      </div>
    </Modal>
  );
}
