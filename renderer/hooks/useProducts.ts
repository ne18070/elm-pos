'use client';

import { useState, useEffect, useCallback } from 'react';
import { getProducts } from '../../services/supabase/products';
import type { Product } from '../../types';

export function useProducts(businessId: string) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getProducts(businessId);
      setProducts(data);
    } catch (err) {
      setError(String(err));
      // Tenter le cache local si hors ligne
      if (typeof window !== 'undefined' && window.electronAPI) {
        const result = await window.electronAPI.invoke(
          'orders:get-pending' as never
        );
        if (result.success) setProducts([]);
      }
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { products, loading, error, refetch: fetch };
}
