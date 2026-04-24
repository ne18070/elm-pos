'use client';
import { toUserError } from '@/lib/user-error';

import { useState } from 'react';
import { Loader2, Wand2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useNotificationStore } from '@/store/notifications';
import { createCategory, updateCategory } from '@services/supabase/products';
import type { Category } from '@pos-types';

interface CategoryModalProps {
  category: Category | null;
  businessId: string;
  nextSortOrder?: number;
  onClose: () => void;
  onSaved: () => void;
}

// ─── Palettes ─────────────────────────────────────────────────────────────────

const COLORS = [
  '#6366f1', '#8b5cf6', '#a855f7', '#ec4899',
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#14b8a6', '#06b6d4',
  '#3b82f6', '#0ea5e9', '#64748b', '#78716c',
];

const ICONS = [
  // Alimentation
  '🍕', '🍔', '🌮', '🍜', '🥗', '🥩', '🍞', '🧁', '🍰', '🍫', '🥚', '🥦',
  // Boissons
  '☕', '🥤', '🧃', '🍺', '🥛', '🍵', '🧋', '🍷',
  // Mode & Beauté
  '👕', '👗', '👟', '💄', '💍', '🧴',
  // Santé
  '💊', '🩺', '🏥', '🧼',
  // Tech
  '📱', '💻', '🎮', '🔋',
  // Maison
  '🏠', '🔧', '💡', '🧹',
  // Commerce
  '📦', '🛒', '🏷️', '💰', '📊', '✨',
  // Services
  '✂️', '🚗', '📚', '🎵', '🎨', '⚽',
];

// ─── Templates rapides ────────────────────────────────────────────────────────

const TEMPLATES = [
  { name: 'Boissons',      icon: '🥤', color: '#14b8a6' },
  { name: 'Alimentation',  icon: '🍕', color: '#f97316' },
  { name: 'Vêtements',     icon: '👕', color: '#8b5cf6' },
  { name: 'Électronique',  icon: '📱', color: '#3b82f6' },
  { name: 'Soins / Santé', icon: '💊', color: '#22c55e' },
  { name: 'Entretien',     icon: '🧹', color: '#64748b' },
  { name: 'Divers',        icon: '📦', color: '#6366f1' },
  { name: 'Café / Snack',  icon: '☕', color: '#f59e0b' },
];

// ─── Composant ────────────────────────────────────────────────────────────────

export function CategoryModal({
  category,
  businessId,
  nextSortOrder = 0,
  onClose,
  onSaved,
}: CategoryModalProps) {
  const isEdit = !!category;
  const { success, error: notifError } = useNotificationStore();
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name:       category?.name  ?? '',
    color:      category?.color ?? COLORS[0],
    icon:       category?.icon  ?? '',
    customIcon: '',
  });

  function update(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function applyTemplate(t: typeof TEMPLATES[0]) {
    setForm((f) => ({ ...f, name: t.name, icon: t.icon, color: t.color }));
  }

  function handleCustomIcon(val: string) {
    // Ne garder que le premier caractère emoji
    const trimmed = [...val].slice(0, 2).join('');
    update('customIcon', trimmed);
    if (trimmed) update('icon', trimmed);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setLoading(true);
    try {
      const payload = {
        business_id: businessId,
        name:        form.name.trim(),
        color:       form.color || undefined,
        icon:        form.icon  || undefined,
        sort_order:  isEdit ? (category.sort_order ?? nextSortOrder) : nextSortOrder,
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
      notifError(toUserError(err));
    } finally {
      setLoading(false);
    }
  }

  const selectedColor = form.color;

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
      <div className="space-y-5">

        {/* Templates rapides (création uniquement) */}
        {!isEdit && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Wand2 className="w-3.5 h-3.5 text-content-brand" />
              <label className="label mb-0">Démarrage rapide</label>
            </div>
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.name}
                  onClick={() => applyTemplate(t)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                    form.name === t.name && form.icon === t.icon
                      ? 'border-brand-500 bg-badge-brand text-white'
                      : 'border-surface-border text-content-secondary hover:text-white hover:border-slate-500'
                  }`}
                >
                  <span>{t.icon}</span>
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Nom */}
        <div>
          <label className="label">Nom *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            className="input"
            placeholder="Ex: Boissons"
            autoFocus
          />
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
                className={`w-7 h-7 rounded-full border-2 transition-all ${
                  selectedColor === color ? 'border-white scale-125' : 'border-transparent hover:scale-110'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Icône */}
        <div>
          <label className="label">Icône</label>
          <div className="flex flex-wrap gap-1.5 mt-1 max-h-36 overflow-y-auto pr-1">
            {/* Aucune icône */}
            <button
              onClick={() => update('icon', '')}
              className={`w-9 h-9 rounded-xl border text-xs transition-all ${
                form.icon === ''
                  ? 'border-brand-500 bg-badge-brand text-content-brand'
                  : 'border-surface-border text-slate-500 hover:border-slate-500'
              }`}
            >
              ×
            </button>
            {ICONS.map((icon) => (
              <button
                key={icon}
                onClick={() => update('icon', icon)}
                className={`w-9 h-9 text-xl rounded-xl border transition-all ${
                  form.icon === icon
                    ? 'border-brand-500 bg-badge-brand'
                    : 'border-surface-border hover:border-slate-500'
                }`}
              >
                {icon}
              </button>
            ))}
          </div>

          {/* Icône personnalisée */}
          <div className="flex items-center gap-2 mt-2">
            <input
              type="text"
              value={form.customIcon}
              onChange={(e) => handleCustomIcon(e.target.value)}
              placeholder="Ou colle un emoji ici…"
              className="input flex-1 text-center text-xl"
              maxLength={4}
            />
            {form.customIcon && (
              <span className="text-xs text-slate-500">→ sélectionné</span>
            )}
          </div>
        </div>

        {/* Aperçu */}
        {form.name && (
          <div>
            <label className="label">Aperçu</label>
            <div
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium"
              style={{
                backgroundColor: selectedColor + '22',
                border: `1px solid ${selectedColor}55`,
              }}
            >
              {form.icon && <span className="text-lg">{form.icon}</span>}
              <span style={{ color: selectedColor }}>{form.name}</span>
            </div>
          </div>
        )}

      </div>
    </Modal>
  );
}
