'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useNotificationStore } from '@/store/notifications';
import { createCoupon, updateCoupon } from '@services/supabase/coupons';
import type { Coupon } from '@pos-types';

interface CouponModalProps {
  coupon: Coupon | null;
  businessId: string;
  onClose: () => void;
  onSaved: () => void;
}

export function CouponModal({ coupon, businessId, onClose, onSaved }: CouponModalProps) {
  const isEdit = !!coupon;
  const { success, error: notifError } = useNotificationStore();
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    code:             coupon?.code ?? '',
    type:             coupon?.type ?? 'percentage' as 'percentage' | 'fixed',
    value:            String(coupon?.value ?? ''),
    min_order_amount: String(coupon?.min_order_amount ?? ''),
    max_uses:         String(coupon?.max_uses ?? ''),
    per_user_limit:   String(coupon?.per_user_limit ?? ''),
    expires_at:       coupon?.expires_at?.slice(0, 10) ?? '',
    is_active:        coupon?.is_active ?? true,
  });

  function update(field: string, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSave() {
    if (!form.code || !form.value) return;
    setLoading(true);
    try {
      const payload = {
        business_id:      businessId,
        code:             form.code.toUpperCase().trim(),
        type:             form.type,
        value:            parseFloat(form.value),
        min_order_amount: form.min_order_amount ? parseFloat(form.min_order_amount) : undefined,
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
      notifError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title={isEdit ? 'Modifier le coupon' : 'Nouveau coupon'}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary px-5">Annuler</button>
          <button
            onClick={handleSave}
            disabled={loading || !form.code || !form.value}
            className="btn-primary px-5 flex items-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdit ? 'Enregistrer' : 'Créer'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">Code promo *</label>
          <input
            type="text"
            value={form.code}
            onChange={(e) => update('code', e.target.value.toUpperCase())}
            className="input font-mono tracking-widest"
            placeholder="PROMO20"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Type</label>
            <select
              value={form.type}
              onChange={(e) => update('type', e.target.value)}
              className="input"
            >
              <option value="percentage">Pourcentage (%)</option>
              <option value="fixed">Montant fixe</option>
            </select>
          </div>
          <div>
            <label className="label">
              Valeur {form.type === 'percentage' ? '(%)' : ''} *
            </label>
            <input
              type="number"
              min="0"
              max={form.type === 'percentage' ? '100' : undefined}
              step="0.01"
              value={form.value}
              onChange={(e) => update('value', e.target.value)}
              className="input"
              placeholder={form.type === 'percentage' ? '10' : '500'}
            />
          </div>
        </div>

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

        <div>
          <label className="label">Date d&apos;expiration</label>
          <input
            type="date"
            value={form.expires_at}
            onChange={(e) => update('expires_at', e.target.value)}
            className="input"
          />
        </div>

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
