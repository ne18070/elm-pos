'use client';

import { useState, useEffect, useCallback } from 'react';
import { getCategories } from '../../services/supabase/products';
import type { Category } from '../../types';

export function useCategories(businessId: string) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { categories, loading, refetch: fetch };
}
