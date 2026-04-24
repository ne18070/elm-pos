'use client';
import { toUserError } from '@/lib/user-error';

import { useState, useRef } from 'react';
import { Loader2, Upload, X, ScanLine, Plus, Trash2, RefreshCw } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useCategories } from '@/hooks/useCategories';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { createProduct, updateProduct } from '@services/supabase/products';
import { uploadProductImage } from '@services/supabase/storage';
import type { Product, ProductVariant } from '@pos-types';

const DEFAULT_UNITS = ['pièce', 'kg', 'g', 'litre', 'cl', 'carton', 'sac', 'sachet', 'boîte', 'paquet', 'lot'];

function generateSKU(name: string): string {
  const prefix = name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 3)
    .padEnd(3, 'X');
  const suffix = String(Math.floor(Math.random() * 9000) + 1000);
  return `${prefix}-${suffix}`;
}

interface ProductModalProps {
  product: Product | null;
  businessId: string;
  onClose: () => void;
  onSaved: () => void;
}

export function ProductModal({ product, businessId, onClose, onSaved }: ProductModalProps) {
  const isEdit = !!product;
  const { categories } = useCategories(businessId);
  const { business } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();
  const stockUnits = business?.stock_units ?? DEFAULT_UNITS;
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
    unit:        product?.unit ?? '',
    is_active:   product?.is_active ?? true,
    image_url:   product?.image_url ?? '',
  });

  const [variants, setVariants] = useState<ProductVariant[]>(
    product?.variants ?? []
  );

  function addVariant() {
    setVariants((v) => [
      ...v,
      { id: crypto.randomUUID(), name: '', price_modifier: 0, stock_consumption: 1 },
    ]);
  }

  function removeVariant(id: string) {
    setVariants((v) => v.filter((vr) => vr.id !== id));
  }

  function updateVariant(id: string, field: keyof ProductVariant, value: string | number) {
    setVariants((v) =>
      v.map((vr) => (vr.id === id ? { ...vr, [field]: value } : vr))
    );
  }

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
      notifError(toUserError(err));
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
        stock:        form.track_stock && form.stock ? parseFloat(form.stock) : undefined,
        unit:         form.unit || undefined,
        is_active:    form.is_active,
        image_url:    form.image_url || undefined,
        variants,
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
      notifError(toUserError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title={isEdit ? 'Modifier le produit' : 'Nouveau produit'}
      onClose={onClose}
      size="md"
      guard
      footer={(requestClose) => (
        <>
          <button onClick={requestClose} className="btn-secondary px-5">Annuler</button>
          <button
            onClick={handleSave}
            disabled={loading || !form.name || !form.price}
            className="btn-primary px-5 flex items-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdit ? 'Enregistrer' : 'Créer'}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        {/* Image */}
        <div>
          <label className="label">Image du produit</label>
          <div className="flex items-center gap-3">
            {/* Aperçu */}
            <div className="w-20 h-20 rounded-xl bg-surface-input border border-surface-border overflow-hidden shrink-0 flex items-center justify-center">
              {uploadingImage ? (
                <Loader2 className="w-6 h-6 animate-spin text-content-secondary" />
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
                  className="text-xs text-status-error hover:text-status-error flex items-center gap-1"
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
                  scanMode ? 'border-brand-500 text-content-brand' : ''
                }`}
              >
                <ScanLine className="w-4 h-4" />
              </button>
            </div>
            {scanMode && (
              <p className="text-xs text-content-brand mt-1">
                Pointez le scanner vers le code-barres…
              </p>
            )}
          </div>
          <div>
            <label className="label">SKU</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.sku}
                onChange={(e) => update('sku', e.target.value)}
                className="input font-mono flex-1"
                placeholder="REF-001"
              />
              <button
                type="button"
                onClick={() => update('sku', generateSKU(form.name || 'PRD'))}
                title="Générer automatiquement"
                className="btn-secondary px-2.5 shrink-0"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
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
              step="0.001"
            />
          )}
        </div>

        {/* Unité de stock */}
        {form.track_stock && (
          <div>
            <label className="label">Unité de stock</label>
            <select
              value={form.unit}
              onChange={(e) => update('unit', e.target.value)}
              className="input"
            >
              <option value="">— Choisir une unité —</option>
              {stockUnits.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">
              Gérez la liste dans Paramètres → Unités de stock
            </p>
          </div>
        )}

        {/* Variantes */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">Variantes</label>
            <button
              type="button"
              onClick={addVariant}
              className="btn-secondary text-xs flex items-center gap-1 py-1 px-2"
            >
              <Plus className="w-3 h-3" />
              Ajouter
            </button>
          </div>

          {variants.length === 0 ? (
            <p className="text-xs text-slate-500 italic">Aucune variante — le produit est vendu tel quel.</p>
          ) : (
            <div className="space-y-2">
              {variants.map((vr) => (
                <div key={vr.id} className="flex items-center gap-2 p-2 rounded-lg bg-surface-input">
                  {/* Nom de la variante */}
                  <input
                    type="text"
                    value={vr.name}
                    onChange={(e) => updateVariant(vr.id, 'name', e.target.value)}
                    className="input flex-1 py-1.5 text-sm"
                    placeholder="Ex: 500g, Large…"
                  />
                  {/* Prix de vente final */}
                  <div className="flex flex-col items-start gap-0.5">
                    <input
                      type="number"
                      value={parseFloat(form.price || '0') + vr.price_modifier || ''}
                      onChange={(e) => {
                        const finalPrice = parseFloat(e.target.value) || 0;
                        const base = parseFloat(form.price || '0');
                        updateVariant(vr.id, 'price_modifier', finalPrice - base);
                      }}
                      className="input w-28 py-1.5 text-sm"
                      placeholder="Prix vente"
                      step="0.01"
                      min="0"
                    />
                    <span className="text-[10px] text-slate-500 pl-1">prix de vente</span>
                  </div>
                  {/* Consommation stock */}
                  {form.track_stock && (
                    <div className="flex flex-col items-start gap-0.5">
                      <input
                        type="number"
                        value={vr.stock_consumption ?? 1}
                        onChange={(e) => updateVariant(vr.id, 'stock_consumption', parseFloat(e.target.value) || 1)}
                        className="input w-20 py-1.5 text-sm"
                        placeholder="1"
                        step="0.001"
                        min="0.001"
                      />
                      <span className="text-[10px] text-slate-500 pl-1">
                        {form.unit ? form.unit : 'unité'}/vente
                      </span>
                    </div>
                  )}
                  {/* Supprimer */}
                  <button
                    type="button"
                    onClick={() => removeVariant(vr.id)}
                    className="text-slate-500 hover:text-status-error transition-colors shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
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
