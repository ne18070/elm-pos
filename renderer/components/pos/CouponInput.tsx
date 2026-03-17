'use client';

import { useState } from 'react';
import { Tag, Loader2 } from 'lucide-react';
import { validateCoupon } from '@services/supabase/coupons';
import { useAuthStore } from '@/store/auth';
import type { Coupon } from '@pos-types';

interface CouponInputProps {
  businessId: string;
  orderTotal: number;
  onApply: (coupon: Coupon) => void;
}

export function CouponInput({ businessId, orderTotal, onApply }: CouponInputProps) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState('');
  const { user } = useAuthStore();

  async function handleApply() {
    if (!code.trim() || !user) return;
    setLoading(true);
    setErreur('');
    try {
      const { coupon, error } = await validateCoupon(
        code,
        businessId,
        orderTotal,
        user.id
      );
      if (error || !coupon) {
        setErreur(error ?? 'Coupon invalide');
        return;
      }
      onApply(coupon);
      setCode('');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && handleApply()}
            placeholder="Code promo"
            className="input pl-8 py-2 text-sm"
          />
        </div>
        <button
          onClick={handleApply}
          disabled={loading || !code.trim()}
          className="btn-secondary px-3 py-2 text-sm shrink-0 flex items-center gap-1"
        >
          {loading && <Loader2 className="w-3 h-3 animate-spin" />}
          Appliquer
        </button>
      </div>
      {erreur && <p className="text-xs text-red-400">{erreur}</p>}
    </div>
  );
}
