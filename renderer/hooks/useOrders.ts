'use client';

import { useState, useEffect, useCallback } from 'react';
import { getOrders } from '../../services/supabase/orders';
import type { Order } from '../../types';

interface UseOrdersOptions {
  status?: string;
  limit?: number;
  date?: string;
}

export function useOrders(businessId: string, options?: UseOrdersOptions) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getOrders(businessId, options);
      setOrders(result.orders);
      setCount(result.count);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, options?.status, options?.date, options?.limit]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { orders, count, loading, error, refetch: fetch };
}
