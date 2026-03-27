'use client';

import { useState, useEffect, useCallback } from 'react';
import { getCategories } from '@services/supabase/products';
import type { Category } from '@pos-types';

export function useCategories(businessId: string) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading]       = useState(true);

  const fetch = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const data = await getCategories(businessId);
      setCategories(data);
    } catch {
      // ignorer silencieusement en mode hors ligne
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => { fetch(); }, [fetch]);

  // Real-time: sync category changes from other terminals
  useEffect(() => {
    if (!businessId) return;
    const handler = () => { fetch(); };
    window.addEventListener('elm-pos:categories:changed', handler);
    return () => window.removeEventListener('elm-pos:categories:changed', handler);
  }, [businessId, fetch]);

  return { categories, loading, refetch: fetch };
}
