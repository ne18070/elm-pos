'use client';

import { useState, useEffect, useCallback } from 'react';
import { getCoupons } from '@services/supabase/coupons';
import type { Coupon } from '@pos-types';

export function useCoupons(businessId: string) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const data = await getCoupons(businessId);
      setCoupons(data);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => { fetch(); }, [fetch]);

  // Real-time: sync coupon usage counts from other terminals
  useEffect(() => {
    if (!businessId) return;
    const handler = () => { fetch(); };
    window.addEventListener('elm-pos:coupons:changed', handler);
    return () => window.removeEventListener('elm-pos:coupons:changed', handler);
  }, [businessId, fetch]);

  return { coupons, loading, refetch: fetch };
}
