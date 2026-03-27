'use client';

import { useState, useEffect, useCallback } from 'react';
import { getProducts } from '@services/supabase/products';
import type { Product } from '@pos-types';

// `realtime` param kept for backward compatibility but no longer creates its own
// channel — real-time updates come from the central useRealtimeSync() channel
// mounted in the dashboard layout via CustomEvents.
export function useProducts(businessId: string, _realtime = false) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getProducts(businessId);
      setProducts(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  // Initial load
  useEffect(() => { fetch(); }, [fetch]);

  // Real-time updates via central channel (useRealtimeSync dispatches this event)
  useEffect(() => {
    if (!businessId) return;

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { eventType: string; record?: Partial<Product> } | undefined;

      if (detail?.eventType === 'UPDATE' && detail.record?.id) {
        // Targeted in-place update — avoids a full refetch for stock changes
        setProducts((prev) =>
          prev.map((p) =>
            p.id === detail.record!.id ? { ...p, ...detail.record } : p
          )
        );
      } else {
        // INSERT or DELETE → full refetch to get category join
        fetch();
      }
    };

    window.addEventListener('elm-pos:products:changed', handler);
    return () => window.removeEventListener('elm-pos:products:changed', handler);
  }, [businessId, fetch]);

  return { products, loading, error, refetch: fetch };
}
