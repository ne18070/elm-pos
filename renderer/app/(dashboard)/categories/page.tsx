'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, LayoutGrid } from 'lucide-react';
import { useCategories } from '@/hooks/useCategories';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { CategoryModal } from '@/components/categories/CategoryModal';
import { deleteCategory } from '@services/supabase/products';
import type { Category } from '@pos-types';

export default function CategoriesPage() {
  const { business } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();
  const [editCategory, setEditCategory] = useState<Category | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { categories, loading, refetch } = useCategories(business?.id ?? '');

  async function handleDelete(cat: Category) {
    if (!confirm(`Supprimer "${cat.name}" ? Les produits de cette catégorie ne seront pas supprimés.`)) return;
    try {
      await deleteCategory(cat.id);
      success(`"${cat.name}" supprimée`);
      refetch();
    } catch (err) {
      notifError(String(err));
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-surface-border">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">Catégories</h1>
          <button
            onClick={() => setShowCreate(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nouvelle catégorie
          </button>
        </div>
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="text-slate-400 text-center py-16">Chargement...</div>
        ) : categories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <LayoutGrid className="w-12 h-12 mb-3 opacity-30" />
            <p className="font-medium">Aucune catégorie</p>
            <p className="text-sm mt-1">Créez une catégorie pour organiser vos produits.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {categories.map((cat) => (
              <div key={cat.id} className="card p-4 flex items-center gap-4 group">
                {/* Badge couleur + icône */}
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                  style={{ backgroundColor: (cat.color ?? '#6366f1') + '22' }}
                >
                  {cat.icon ? (
                    <span>{cat.icon}</span>
                  ) : (
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: cat.color ?? '#6366f1' }}
                    />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white truncate">{cat.name}</p>
                  <p className="text-xs text-slate-500">Ordre : {cat.sort_order}</p>
                </div>

                {/* Actions */}
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={() => setEditCategory(cat)}
                    className="btn-secondary p-2"
                    title="Modifier"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(cat)}
                    className="btn-danger p-2"
                    title="Supprimer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {(showCreate || editCategory) && (
        <CategoryModal
          category={editCategory}
          businessId={business?.id ?? ''}
          nextSortOrder={categories.length}
          onClose={() => { setShowCreate(false); setEditCategory(null); }}
          onSaved={() => { setShowCreate(false); setEditCategory(null); refetch(); }}
        />
      )}
    </div>
  );
}
