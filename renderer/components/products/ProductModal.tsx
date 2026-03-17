'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useCategories } from '@/hooks/useCategories';
import { useNotificationStore } from '@/store/notifications';
import { createProduct, updateProduct } from '../../../services/supabase/products';
import type { Product } from '../../../../types';

interface ProductModalProps {
  product: Product | null;
  businessId: string;
  onClose: () => void;
  onSaved: () => void;
}

export function ProductModal({ product, businessId, onClose, onSaved }: ProductModalProps) {
  const isEdit = !!product;
  const { categories } = useCategories(businessId);
  const { success, error: notifError } = useNotificationStore();
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name:        product?.name ?? '',
    description: product?.description ?? '',
    price:       String(product?.price ?? ''),
    category_id: product?.category_id ?? '',
    barcode:     product?.barcode ?? '',
    sku:         product?.sku ?? '',
    track_stock: product?.track_stock ?? false,
    stock:       String(product?.stock ?? ''),
    is_active:   product?.is_active ?? true,
  });

  function update(field: string, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSave() {
    if (!form.name || !form.price) return;
    setLoading(true);
    try {
      const payload = {
        business_id:  businessId,
        name:         form.name,
        description:  form.description || undefined,
        price:        parseFloat(form.price),
        category_id:  form.category_id || undefined,
        barcode:      form.barcode || undefined,
        sku:          form.sku || undefined,
        track_stock:  form.track_stock,
        stock:        form.track_stock && form.stock ? parseInt(form.stock) : undefined,
        is_active:    form.is_active,
        variants:     product?.variants ?? [],
      };

      if (isEdit) {
        await updateProduct(product.id, payload);
        success('Produit mis à jour');
      } else {
        await createProduct(payload as Parameters<typeof createProduct>[0]);
        success('Produit créé');
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
      title={isEdit ? 'Modifier le produit' : 'Nouveau produit'}
      onClose={onClose}
      size="md"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary px-5">Annuler</button>
          <button
            onClick={handleSave}
            disabled={loading || !form.name || !form.price}
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
          <label className="label">Nom du produit *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            className="input"
            placeholder="Ex: Café Expresso"
            autoFocus
          />
        </div>

        {/* Description */}
        <div>
          <label className="label">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => update('description', e.target.value)}
            className="input resize-none"
            rows={2}
            placeholder="Description courte..."
          />
        </div>

        {/* Prix + Catégorie */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Prix *</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={form.price}
              onChange={(e) => update('price', e.target.value)}
              className="input"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="label">Catégorie</label>
            <select
              value={form.category_id}
              onChange={(e) => update('category_id', e.target.value)}
              className="input"
            >
              <option value="">— Sans catégorie —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Barcode + SKU */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Code-barres</label>
            <input
              type="text"
              value={form.barcode}
              onChange={(e) => update('barcode', e.target.value)}
              className="input font-mono"
              placeholder="EAN13..."
            />
          </div>
          <div>
            <label className="label">SKU</label>
            <input
              type="text"
              value={form.sku}
              onChange={(e) => update('sku', e.target.value)}
              className="input font-mono"
              placeholder="REF-001"
            />
          </div>
        </div>

        {/* Gestion du stock */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-input">
          <input
            type="checkbox"
            id="track_stock"
            checked={form.track_stock}
            onChange={(e) => update('track_stock', e.target.checked)}
            className="w-4 h-4 rounded"
          />
          <label htmlFor="track_stock" className="text-sm text-slate-300 cursor-pointer flex-1">
            Gérer le stock
          </label>
          {form.track_stock && (
            <input
              type="number"
              value={form.stock}
              onChange={(e) => update('stock', e.target.value)}
              className="input w-24 py-1.5 text-sm"
              placeholder="Qtité"
              min="0"
            />
          )}
        </div>

        {/* Actif */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="is_active"
            checked={form.is_active}
            onChange={(e) => update('is_active', e.target.checked)}
            className="w-4 h-4 rounded"
          />
          <label htmlFor="is_active" className="text-sm text-slate-300 cursor-pointer">
            Produit actif (visible en caisse)
          </label>
        </div>
      </div>
    </Modal>
  );
}
