'use client';

import { useState, useRef, useCallback } from 'react';
import { Loader2, Upload, X, ScanLine } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useCategories } from '@/hooks/useCategories';
import { useNotificationStore } from '@/store/notifications';
import { createProduct, updateProduct } from '@services/supabase/products';
import { uploadProductImage } from '@services/supabase/storage';
import type { Product } from '@pos-types';

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
  const [uploadingImage, setUploadingImage] = useState(false);
  const [scanMode, setScanMode] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    image_url:   product?.image_url ?? '',
  });

  function update(field: string, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const url = await uploadProductImage(businessId, file);
      update('image_url', url);
    } catch (err) {
      notifError("Erreur lors de l'upload : " + String(err));
    } finally {
      setUploadingImage(false);
    }
  }

  // Mode scan : active le focus sur le champ code-barres
  // Le scanner HID va saisir directement dans l'input
  function activateScanMode() {
    setScanMode(true);
    setTimeout(() => barcodeInputRef.current?.focus(), 50);
  }

  // Quand le champ barcode reçoit Enter (scanner) → désactiver le mode scan
  function handleBarcodeKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      setScanMode(false);
    }
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
        image_url:    form.image_url || undefined,
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
        {/* Image */}
        <div>
          <label className="label">Image du produit</label>
          <div className="flex items-center gap-3">
            {/* Aperçu */}
            <div className="w-20 h-20 rounded-xl bg-surface-input border border-surface-border overflow-hidden shrink-0 flex items-center justify-center">
              {uploadingImage ? (
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              ) : form.image_url ? (
                <img src={form.image_url} alt="Aperçu" className="w-full h-full object-cover" />
              ) : (
                <Upload className="w-6 h-6 text-slate-600" />
              )}
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                className="btn-secondary text-sm flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                {form.image_url ? 'Changer' : 'Choisir une image'}
              </button>
              {form.image_url && (
                <button
                  type="button"
                  onClick={() => update('image_url', '')}
                  className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> Supprimer
                </button>
              )}
              <p className="text-xs text-slate-500">JPG, PNG, WEBP · max 5 Mo</p>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageChange}
          />
        </div>

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

        {/* Code-barres + SKU */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Code-barres</label>
            <div className="flex gap-2">
              <input
                ref={barcodeInputRef}
                type="text"
                value={form.barcode}
                onChange={(e) => update('barcode', e.target.value)}
                onKeyDown={handleBarcodeKeyDown}
                className={`input font-mono flex-1 transition-all ${
                  scanMode ? 'border-brand-500 ring-1 ring-brand-500' : ''
                }`}
                placeholder={scanMode ? 'Scannez maintenant...' : 'EAN13...'}
              />
              <button
                type="button"
                onClick={activateScanMode}
                title="Cliquez puis scannez le code-barres"
                className={`btn-secondary px-2.5 shrink-0 ${
                  scanMode ? 'border-brand-500 text-brand-400' : ''
                }`}
              >
                <ScanLine className="w-4 h-4" />
              </button>
            </div>
            {scanMode && (
              <p className="text-xs text-brand-400 mt-1">
                Pointez le scanner vers le code-barres…
              </p>
            )}
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
              placeholder="Qté"
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
