'use client';

import { useState } from 'react';
import { Tag, ChevronDown, ChevronUp, Check, Percent, DollarSign, Gift } from 'lucide-react';
import { useCoupons } from '@/hooks/useCoupons';
import { formatCurrency } from '@/lib/utils';
import type { Coupon } from '@pos-types';

interface CouponPickerProps {
  businessId: string;
  currency: string;
  orderTotal: number;
  cartItemCount: number;
  selectedIds: string[];
  onAdd: (coupon: Coupon) => void;
  onRemove: (couponId: string) => void;
}

function couponIcon(type: Coupon['type']) {
  if (type === 'percentage') return <Percent className="w-3.5 h-3.5" />;
  if (type === 'fixed')      return <DollarSign className="w-3.5 h-3.5" />;
  return <Gift className="w-3.5 h-3.5" />;
}

function couponLabel(coupon: Coupon, currency: string): string {
  if (coupon.type === 'percentage') return `-${coupon.value}%`;
  if (coupon.type === 'fixed')      return `-${formatCurrency(coupon.value, currency)}`;
  return coupon.free_item_label ?? 'Article offert';
}

function isEligible(coupon: Coupon, orderTotal: number, cartItemCount: number): boolean {
  if (!coupon.is_active) return false;
  if (coupon.max_uses != null && coupon.uses_count >= coupon.max_uses) return false;
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) return false;
  if (coupon.min_order_amount != null && orderTotal < coupon.min_order_amount) return false;
  if (coupon.min_quantity != null && cartItemCount < coupon.min_quantity) return false;
  return true;
}

export function CouponPicker({
  businessId,
  currency,
  orderTotal,
  cartItemCount,
  selectedIds,
  onAdd,
  onRemove,
}: CouponPickerProps) {
  const [open, setOpen] = useState(false);
  const { coupons, loading } = useCoupons(businessId);

  const active = coupons.filter((c) => c.is_active);

  if (active.length === 0 && !loading) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-xl border border-surface-border
                   text-content-secondary hover:border-slate-500 hover:text-content-primary transition-colors text-xs font-medium"
      >
        <Tag className="w-3.5 h-3.5 shrink-0" />
        <span className="flex-1 text-left">
          {selectedIds.length > 0
            ? `${selectedIds.length} promo${selectedIds.length > 1 ? 's' : ''} appliquée${selectedIds.length > 1 ? 's' : ''}`
            : 'Ajouter une promotion'}
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 shrink-0" />}
      </button>

      {open && (
        <div className="mt-2 rounded-xl border border-surface-border bg-surface-card overflow-hidden">
          {loading ? (
            <p className="text-xs text-content-primary text-center py-3">Chargement…</p>
          ) : (
            <div className="max-h-48 overflow-y-auto divide-y divide-surface-border">
              {active.map((coupon) => {
                const selected = selectedIds.includes(coupon.id);
                const eligible = isEligible(coupon, orderTotal, cartItemCount);

                return (
                  <button
                    key={coupon.id}
                    type="button"
                    disabled={!eligible && !selected}
                    onClick={() => selected ? onRemove(coupon.id) : onAdd(coupon)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors
                      ${selected
                        ? 'bg-badge-success hover:bg-badge-success'
                        : eligible
                          ? 'hover:bg-surface-input'
                          : 'opacity-40 cursor-not-allowed'
                      }`}
                  >
                    {/* Icône type */}
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0
                      ${selected ? 'bg-badge-success text-status-success' : 'bg-surface-input text-content-secondary'}`}
                    >
                      {couponIcon(coupon.type)}
                    </div>

                    {/* Infos */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold truncate ${selected ? 'text-status-success' : 'text-content-primary'}`}>
                        {coupon.code}
                      </p>
                      <p className="text-xs text-content-primary truncate">
                        {couponLabel(coupon, currency)}
                        {coupon.min_order_amount != null && ` · min ${formatCurrency(coupon.min_order_amount, currency)}`}
                        {coupon.min_quantity != null && ` · min ${coupon.min_quantity} articles`}
                      </p>
                    </div>

                    {/* Check si sélectionné */}
                    {selected && <Check className="w-4 h-4 text-status-success shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


