'use client';
import { toUserError } from '@/lib/user-error';

import { useState, useMemo } from 'react';
import { Loader2, Gift, Package } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useNotificationStore } from '@/store/notifications';
import { useProducts } from '@/hooks/useProducts';
import { createCoupon, updateCoupon } from '@services/supabase/coupons';
import type { Coupon, CouponType, Product } from '@pos-types';

interface CouponModalProps {
  coupon: Coupon | null;
  businessId: string;
  onClose: () => void;
  onSaved: () => void;
}

export function CouponModal({ coupon, businessId, onClose, onSaved }: CouponModalProps) {
  const isEdit = !!coupon;
  const { success, error: notifError } = useNotificationStore();
  const { products } = useProducts(businessId);
  const [loading, setLoading] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [freeProduct, setFreeProduct] = useState<Product | null>(
    coupon?.free_item_product_id
      ? null // will be resolved lazily if needed
      : null
  );

  const [form, setForm] = useState({
    code:                  coupon?.code ?? '',
    type:                  (coupon?.type ?? 'percentage') as CouponType,
    value:                 String(coupon?.type === 'free_item' ? '' : (coupon?.value ?? '')),
    min_order_amount:      String(coupon?.min_order_amount ?? ''),
    min_quantity:          String(coupon?.min_quantity ?? ''),
    free_item_label:       coupon?.free_item_label ?? '',
    free_item_product_id:  coupon?.free_item_product_id ?? '',
    free_item_quantity:    String(coupon?.free_item_quantity ?? '1'),
    max_uses:              String(coupon?.max_uses ?? ''),
    per_user_limit:        String(coupon?.per_user_limit ?? ''),
    expires_at:            coupon?.expires_at?.slice(0, 10) ?? '',
    is_active:             coupon?.is_active ?? true,
  });

  const filteredProducts = useMemo(() => {
    if (!productSearch) return products.slice(0, 6);
    const q = productSearch.toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q)).slice(0, 6);
  }, [products, productSearch]);

  function update(field: string, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  const isFreeItem = form.type === 'free_item';

  function selectFreeProduct(p: Product) {
    setFreeProduct(p);
    setProductSearch(p.name);
    setShowProductDropdown(false);
    update('free_item_product_id', p.id);
    if (!form.free_item_label) update('free_item_label', p.name);
  }

  // Validation : pour free_item, valeur n'est pas requise (= 0)
  const isValid = form.code.trim() !== '' && (
    isFreeItem
      ? form.free_item_label.trim() !== ''
      : parseFloat(form.value) > 0 && (form.type !== 'percentage' || parseFloat(form.value) <= 100)
  );

  async function handleSave() {
    if (!isValid) return;
    setLoading(true);
    try {
      const payload = {
        business_id:      businessId,
        code:             form.code.toUpperCase().trim(),
        type:             form.type,
        value:            isFreeItem ? 0 : parseFloat(form.value),
        min_order_amount: form.min_order_amount ? parseFloat(form.min_order_amount) : undefined,
        min_quantity:     form.min_quantity ? parseInt(form.min_quantity) : undefined,
        free_item_label:       isFreeItem ? form.free_item_label.trim() : undefined,
        free_item_product_id:  isFreeItem && form.free_item_product_id ? form.free_item_product_id : undefined,
        free_item_quantity:    isFreeItem ? (parseFloat(form.free_item_quantity) || 1) : undefined,
        max_uses:         form.max_uses ? parseInt(form.max_uses) : undefined,
        per_user_limit:   form.per_user_limit ? parseInt(form.per_user_limit) : undefined,
        expires_at:       form.expires_at ? new Date(form.expires_at).toISOString() : undefined,
        is_active:        form.is_active,
      };

      if (isEdit) {
        await updateCoupon(coupon.id, payload);
        success('Coupon mis à jour');
      } else {
        await createCoupon(payload as Parameters<typeof createCoupon>[0]);
        success('Coupon créé');
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
      title={isEdit ? 'Modifier le coupon' : 'Nouveau coupon'}
      onClose={onClose}
      size="sm"
      guard
      footer={(requestClose) => (
        <>
          <button onClick={requestClose} className="btn-secondary px-5">Annuler</button>
          <button
            onClick={handleSave}
            disabled={loading || !isValid}
            className="btn-primary px-5 flex items-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdit ? 'Enregistrer' : 'Créer'}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        {/* Code */}
        <div>
          <label className="label">Code promo *</label>
          <input
            type="text"
            value={form.code}
            onChange={(e) => update('code', e.target.value.toUpperCase())}
            className="input font-mono tracking-widest"
            placeholder="PROMO20"
            autoFocus
          />
        </div>

        {/* Type */}
        <div>
          <label className="label">Type de coupon</label>
          <div className="grid grid-cols-3 gap-2">
            {(['percentage', 'fixed', 'free_item'] as CouponType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => update('type', t)}
                className={`py-2.5 px-2 rounded-xl border text-xs font-medium transition-colors flex flex-col items-center gap-1 ${
                  form.type === t
                    ? 'border-brand-500 bg-badge-brand text-content-brand'
                    : 'border-surface-border text-content-secondary hover:text-white'
                }`}
              >
                {t === 'free_item' && <Gift className="w-3.5 h-3.5" />}
                {t === 'percentage' ? '% Réduction' : t === 'fixed' ? 'Montant fixe' : 'Article offert'}
              </button>
            ))}
          </div>
        </div>

        {/* Champs selon le type */}
        {isFreeItem ? (
          <div className="space-y-3 p-3 bg-badge-warning border border-status-warning/40 rounded-xl">
            <div className="flex items-center gap-2 text-status-warning text-xs font-medium">
              <Gift className="w-3.5 h-3.5" />
              Offre : achat X → article offert
            </div>
            {/* Produit offert */}
            <div>
              <label className="label">Produit offert (stock)</label>
              <div className="relative">
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => { setProductSearch(e.target.value); setShowProductDropdown(true); setFreeProduct(null); update('free_item_product_id', ''); }}
                  onFocus={() => setShowProductDropdown(true)}
                  onBlur={() => setTimeout(() => setShowProductDropdown(false), 150)}
                  placeholder="Rechercher le produit à offrir…"
                  className="input w-full"
                  autoComplete="off"
                />
                {showProductDropdown && filteredProducts.length > 0 && (
                  <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-surface-card border border-slate-700 rounded-xl overflow-hidden shadow-xl">
                    {filteredProducts.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onMouseDown={() => selectFreeProduct(p)}
                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-700 text-left"
                      >
                        <Package className="w-4 h-4 text-slate-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm text-white truncate">{p.name}</p>
                          {p.track_stock && (
                            <p className="text-xs text-content-secondary">Stock : {p.stock ?? 0} {p.unit ?? 'pièce'}</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {freeProduct && (
                <p className="text-xs text-content-brand mt-1">
                  Stock actuel : {freeProduct.stock ?? 0} {freeProduct.unit ?? 'pièce'}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Quantité offerte</label>
                <input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={form.free_item_quantity}
                  onChange={(e) => update('free_item_quantity', e.target.value)}
                  className="input"
                  placeholder="1"
                />
              </div>
              <div>
                <label className="label">Label sur la facture *</label>
                <input
                  type="text"
                  value={form.free_item_label}
                  onChange={(e) => update('free_item_label', e.target.value)}
                  className="input"
                  placeholder="Ex : 1 bouteille offerte"
                />
              </div>
            </div>

            <div>
              <label className="label">Quantité minimum dans le panier</label>
              <input
                type="number"
                min="1"
                value={form.min_quantity}
                onChange={(e) => update('min_quantity', e.target.value)}
                className="input"
                placeholder="Ex : 10 (cartons)"
              />
              <p className="text-xs text-slate-500 mt-1">
                Nb d'articles total dans le panier pour déclencher l'offre
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">
                Valeur {form.type === 'percentage' ? '(%)' : ''} *
              </label>
              <input
                type="number"
                min="0.01"
                max={form.type === 'percentage' ? '100' : undefined}
                step="0.01"
                value={form.value}
                onChange={(e) => update('value', e.target.value)}
                className="input"
                placeholder={form.type === 'percentage' ? '10' : '500'}
              />
            </div>
            <div>
              <label className="label">Commande minimum</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.min_order_amount}
                onChange={(e) => update('min_order_amount', e.target.value)}
                className="input"
                placeholder="Aucun"
              />
            </div>
          </div>
        )}

        {/* Limites communes */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Utilisations max</label>
            <input
              type="number"
              min="1"
              value={form.max_uses}
              onChange={(e) => update('max_uses', e.target.value)}
              className="input"
              placeholder="Illimité"
            />
          </div>
          <div>
            <label className="label">Date d&apos;expiration</label>
            <input
              type="date"
              value={form.expires_at}
              onChange={(e) => update('expires_at', e.target.value)}
              className="input"
            />
          </div>
        </div>

        {/* Actif */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="coupon_active"
            checked={form.is_active}
            onChange={(e) => update('is_active', e.target.checked)}
            className="w-4 h-4 rounded"
          />
          <label htmlFor="coupon_active" className="text-sm text-slate-300 cursor-pointer">
            Coupon actif
          </label>
        </div>
      </div>
    </Modal>
  );
}
