'use client';
import { toUserError } from '@/lib/user-error';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Gift, Package } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';
import { useNotificationStore } from '@/store/notifications';
import { useAuthStore } from '@/store/auth';
import { useProducts } from '@/hooks/useProducts';
import { createCoupon, updateCoupon } from '@services/supabase/coupons';
import type { Coupon, CouponType, Product } from '@pos-types';

interface CouponModalProps {
  coupon: Coupon | null;
  businessId: string;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Parse un nombre en tolérant la virgule décimale et les espaces (séparateurs
 * de milliers). Renvoie NaN si la valeur n'est pas exploitable.
 */
function parseNumber(input: string): number {
  let s = String(input ?? '').trim().replace(/[\s  ]/g, '');
  if (s === '') return NaN;
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export function CouponModal({ coupon, businessId, onClose, onSaved }: CouponModalProps) {
  const isEdit = !!coupon;
  const { success, error: notifError } = useNotificationStore();
  const { business } = useAuthStore();
  const currency = business?.currency ?? 'XOF';
  const { products } = useProducts(businessId);
  const [loading, setLoading] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const productInputRef = useRef<HTMLInputElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });

  const updateDropdownPos = useCallback(() => {
    if (productInputRef.current) {
      const r = productInputRef.current.getBoundingClientRect();
      setDropdownPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
  }, []);
  const [freeProduct, setFreeProduct] = useState<Product | null>(
    coupon?.free_item_product_id
      ? null // will be resolved lazily if needed
      : null
  );

  // Unité offerte : "unit" = unité de vente du produit ; "subunit" = fraction
  // (ex. la tablette dans un carton). Déduit de free_item_stock_consumption.
  const initConsumption = coupon?.free_item_stock_consumption ?? 1;
  const initByUnit = !coupon || initConsumption >= 1 - 1e-9;

  const [form, setForm] = useState({
    code:                  coupon?.code ?? '',
    type:                  (coupon?.type ?? 'percentage') as CouponType,
    value:                 String(coupon?.type === 'free_item' ? '' : (coupon?.value ?? '')),
    min_order_amount:      String(coupon?.min_order_amount ?? ''),
    min_quantity:          String(coupon?.min_quantity ?? ''),
    free_item_label:       coupon?.free_item_label ?? '',
    free_item_product_id:  coupon?.free_item_product_id ?? '',
    free_item_quantity:    String(coupon?.free_item_quantity ?? '1'),
    // "unit" ou "subunit"
    free_item_by:          (initByUnit ? 'unit' : 'subunit') as 'unit' | 'subunit',
    // nb de sous-unités par unité de vente (ex. 24 tablettes / carton)
    free_item_pack_size:   initByUnit ? '' : String(Math.round(1 / initConsumption) || ''),
    free_item_unit_label:  coupon?.free_item_unit_label ?? '',
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

  // Produit offert effectif : soit celui qu'on vient de choisir, soit celui
  // référencé par le coupon en édition (résolu depuis la liste des produits).
  const effectiveFreeProduct: Product | null =
    freeProduct ?? products.find((p) => p.id === form.free_item_product_id) ?? null;

  // En édition : pré-remplir le champ de recherche avec le nom du produit offert.
  useEffect(() => {
    if (isEdit && effectiveFreeProduct && !productSearch) {
      setProductSearch(effectiveFreeProduct.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveFreeProduct]);

  // Unité de vente du produit (carton, sac…) et sous-unité choisie.
  const sellUnit = effectiveFreeProduct?.unit || 'unité';
  const packSize = parseNumber(form.free_item_pack_size);
  const bySubunit = form.free_item_by === 'subunit';
  // Consommation de stock par unité offerte.
  const freeConsumption = bySubunit && packSize > 0 ? 1 / packSize : 1;
  const offeredUnitLabel = bySubunit ? (form.free_item_unit_label.trim() || 'unité') : sellUnit;
  // Prix unitaire de ce qui est offert.
  const offeredUnitPrice = (effectiveFreeProduct?.price ?? 0) * freeConsumption;

  function selectFreeProduct(p: Product) {
    setFreeProduct(p);
    setProductSearch(p.name);
    setShowProductDropdown(false);
    setForm((f) => ({
      ...f,
      free_item_product_id: p.id,
      free_item_label: f.free_item_label || p.name,
      // Le conditionnement dépend du produit → on repart sur l'unité de vente.
      free_item_by: 'unit',
      free_item_pack_size: '',
      free_item_unit_label: '',
    }));
  }

  // Validation : pour free_item, valeur n'est pas requise (= 0)
  const valueNum = parseNumber(form.value);
  const isValid = form.code.trim() !== '' && (
    isFreeItem
      ? form.free_item_label.trim() !== ''
      : valueNum > 0 && (form.type !== 'percentage' || valueNum <= 100)
  );

  async function handleSave() {
    if (!isValid) return;

    const minOrder   = form.min_order_amount ? parseNumber(form.min_order_amount) : undefined;
    const minQty     = form.min_quantity ? Math.floor(parseNumber(form.min_quantity)) : undefined;
    const maxUses    = form.max_uses ? Math.floor(parseNumber(form.max_uses)) : undefined;
    const perUser    = form.per_user_limit ? Math.floor(parseNumber(form.per_user_limit)) : undefined;
    const freeQty    = isFreeItem ? Math.max(1, Math.floor(parseNumber(form.free_item_quantity) || 1)) : undefined;

    if (minOrder != null && (Number.isNaN(minOrder) || minOrder < 0)) { notifError('Commande minimum invalide.'); return; }
    if (minQty != null && (Number.isNaN(minQty) || minQty < 1)) { notifError('Quantité minimum invalide.'); return; }
    if (maxUses != null && (Number.isNaN(maxUses) || maxUses < 1)) { notifError('Nombre d\'utilisations max invalide.'); return; }
    if (perUser != null && (Number.isNaN(perUser) || perUser < 1)) { notifError('Limite par utilisateur invalide.'); return; }

    // Article offert : unité de vente ou sous-unité (fraction du carton…)
    let freeConsumptionOut = 1;
    let freeUnitLabelOut: string | undefined;
    if (isFreeItem && bySubunit) {
      if (Number.isNaN(packSize) || packSize <= 1) {
        notifError('Indiquez combien de sous-unités contient une ' + sellUnit + ' (> 1).');
        return;
      }
      if (!form.free_item_unit_label.trim()) {
        notifError('Donnez un nom à la sous-unité offerte (ex : tablette, sachet).');
        return;
      }
      freeConsumptionOut = Math.round((1 / packSize) * 1e6) / 1e6;
      freeUnitLabelOut = form.free_item_unit_label.trim();
    }

    setLoading(true);
    try {
      const payload = {
        business_id:      businessId,
        code:             form.code.toUpperCase().trim(),
        type:             form.type,
        value:            isFreeItem ? 0 : valueNum,
        min_order_amount: minOrder,
        min_quantity:     minQty,
        free_item_label:       isFreeItem ? form.free_item_label.trim() : undefined,
        free_item_product_id:  isFreeItem && form.free_item_product_id ? form.free_item_product_id : undefined,
        free_item_quantity:    freeQty,
        free_item_unit_label:       isFreeItem ? freeUnitLabelOut : undefined,
        free_item_stock_consumption: isFreeItem ? freeConsumptionOut : undefined,
        max_uses:         maxUses,
        per_user_limit:   perUser,
        // Fin de journée locale plutôt que minuit UTC (sinon le coupon meurt la
        // veille au soir pour un fuseau à l'est de Greenwich).
        expires_at:       form.expires_at ? new Date(form.expires_at + 'T23:59:59').toISOString() : undefined,
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
            {(['percentage', 'fixed', 'free_item'] as CouponType[]).map((t) => {
              const isActive = form.type === t;
              const labels: Record<string, string> = {
                percentage: '% Réduction',
                fixed: 'Montant fixe',
                free_item: 'Article offert',
              };
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => update('type', t)}
                  className={[
                    'py-3 px-2 rounded-xl border-2 text-xs font-bold transition-all flex flex-col items-center gap-1.5',
                    isActive
                      ? 'border-brand-500 bg-badge-brand text-content-brand scale-[1.02] shadow-md'
                      : 'border-surface-border/80 bg-surface-input text-content-primary hover:border-brand-500/50 hover:bg-surface-hover',
                  ].join(' ')}
                >
                  {t === 'percentage' && <span className="text-base font-black">%</span>}
                  {t === 'fixed'      && <span className="text-base font-black">F</span>}
                  {t === 'free_item'  && <Gift className="w-4 h-4" />}
                  <span>{labels[t]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Champs selon le type */}
        {isFreeItem ? (
          <div className="space-y-3 p-3 bg-badge-warning border border-status-warning/40 rounded-xl">
            <div className="flex items-center gap-2 text-status-warning text-xs font-medium">
              <Gift className="w-3.5 h-3.5" />
              Offre : achat X —article offert
            </div>
            {/* Produit offert */}
            <div>
              <label className="label">Produit offert (stock)</label>
              <div className="relative">
                <input
                  ref={productInputRef}
                  type="text"
                  value={productSearch}
                  onChange={(e) => { setProductSearch(e.target.value); setShowProductDropdown(true); setFreeProduct(null); update('free_item_product_id', ''); updateDropdownPos(); }}
                  onFocus={() => { setShowProductDropdown(true); updateDropdownPos(); }}
                  onBlur={() => setTimeout(() => setShowProductDropdown(false), 150)}
                  placeholder="Rechercher le produit à offrir…"
                  className="input w-full"
                  autoComplete="off"
                />
                {showProductDropdown && filteredProducts.length > 0 && createPortal(
                  <div
                    style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width, zIndex: 9999 }}
                    className="bg-surface-card border border-surface-border rounded-xl overflow-hidden shadow-xl"
                  >
                    {filteredProducts.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onMouseDown={() => selectFreeProduct(p)}
                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-hover text-left"
                      >
                        <Package className="w-4 h-4 text-content-secondary shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm text-content-primary truncate">{p.name}</p>
                          {p.track_stock && (
                            <p className="text-xs text-content-secondary">Stock : {p.stock ?? 0} {p.unit ?? 'pièce'}</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>,
                  document.body
                )}
              </div>
              {effectiveFreeProduct && (
                <p className="text-xs text-content-brand mt-1">
                  Stock actuel : {effectiveFreeProduct.stock ?? 0} {sellUnit}
                  {' · '}Prix : {formatCurrency(effectiveFreeProduct.price, currency)} / {sellUnit}
                </p>
              )}
            </div>

            {/* Unité offerte : au carton ou à la sous-unité */}
            {effectiveFreeProduct && (
              <div>
                <label className="label">On offre…</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => update('free_item_by', 'unit')}
                    className={`py-2 px-2 rounded-lg border-2 text-xs font-semibold transition-all ${
                      !bySubunit
                        ? 'border-brand-500 bg-badge-brand text-content-brand'
                        : 'border-surface-border bg-surface-input text-content-primary hover:border-brand-500/50'
                    }`}
                  >
                    Par {sellUnit}
                  </button>
                  <button
                    type="button"
                    onClick={() => update('free_item_by', 'subunit')}
                    className={`py-2 px-2 rounded-lg border-2 text-xs font-semibold transition-all ${
                      bySubunit
                        ? 'border-brand-500 bg-badge-brand text-content-brand'
                        : 'border-surface-border bg-surface-input text-content-primary hover:border-brand-500/50'
                    }`}
                  >
                    Par sous-unité
                  </button>
                </div>

                {bySubunit && (
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div>
                      <label className="label">Sous-unités par {sellUnit}</label>
                      <input
                        type="number"
                        min="2"
                        step="1"
                        value={form.free_item_pack_size}
                        onChange={(e) => update('free_item_pack_size', e.target.value)}
                        className="input"
                        placeholder="Ex : 24"
                      />
                    </div>
                    <div>
                      <label className="label">Nom de la sous-unité</label>
                      <input
                        type="text"
                        value={form.free_item_unit_label}
                        onChange={(e) => update('free_item_unit_label', e.target.value)}
                        className="input"
                        placeholder="Ex : tablette"
                      />
                    </div>
                  </div>
                )}

                {effectiveFreeProduct.price > 0 && (
                  <p className="text-xs text-content-secondary mt-1.5">
                    Valeur de ce qui est offert :{' '}
                    <span className="font-semibold text-content-primary">
                      {formatCurrency(offeredUnitPrice, currency)} / {offeredUnitLabel}
                    </span>
                    {bySubunit && packSize > 1 && (
                      <> ({(1 / packSize).toFixed(4)} {sellUnit} de stock par {offeredUnitLabel})</>
                    )}
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Quantité offerte (en {offeredUnitLabel})</label>
                <input
                  type="number"
                  min="1"
                  step="1"
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
              <p className="text-xs text-content-primary mt-1">
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
                step="any"
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
                step="any"
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
              step="1"
              value={form.max_uses}
              onChange={(e) => update('max_uses', e.target.value)}
              className="input"
              placeholder="Illimité"
            />
          </div>
          <div>
            <label className="label">Limite par utilisateur</label>
            <input
              type="number"
              min="1"
              step="1"
              value={form.per_user_limit}
              onChange={(e) => update('per_user_limit', e.target.value)}
              className="input"
              placeholder="Illimité"
            />
            <p className="text-xs text-content-muted mt-1">
              Nombre de fois qu'un même caissier peut appliquer ce code.
            </p>
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
          <label htmlFor="coupon_active" className="text-sm text-content-primary cursor-pointer">
            Coupon actif
          </label>
        </div>
      </div>
    </Modal>
  );
}


