'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Product } from '@pos-types';

export const LOW_STOCK_THRESHOLD = 5;

export function useLowStockAlerts(businessId: string) {
  const [lowStock, setLowStock] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!businessId) return;
    const { data } = await supabase
      .from('products')
      .select('*, category:categories(*)')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .eq('track_stock', true)
      .lte('stock', LOW_STOCK_THRESHOLD)
      .order('stock', { ascending: true });
    setLowStock((data ?? []) as unknown as Product[]);
    setLoading(false);
  }, [businessId]);

  useEffect(() => { fetch(); }, [fetch]);

  // Realtime : re-query on product stock updates
  useEffect(() => {
    if (!businessId) return;
    const channel = supabase
      .channel(`low-stock:${businessId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'products', filter: `business_id=eq.${businessId}` },
        () => { fetch(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [businessId, fetch]);

  return { lowStock, count: lowStock.length, loading, refetch: fetch };
}
