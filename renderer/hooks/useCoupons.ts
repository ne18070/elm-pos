'use client';

import { useRealtimeData } from './useRealtimeData';
import { getCoupons } from '@services/supabase/coupons';
import type { Coupon } from '@pos-types';

export function useCoupons(businessId: string) {
  const { data: coupons, loading, refetch } = useRealtimeData<Coupon>(
    businessId,
    getCoupons,
    'elm-pos:coupons:changed',
  );
  return { coupons, loading, refetch };
}
