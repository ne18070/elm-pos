'use client';

import { useRealtimeData } from './useRealtimeData';
import { getCategories } from '@services/supabase/products';
import type { Category } from '@pos-types';

export function useCategories(businessId: string) {
  const { data: categories, loading, refetch } = useRealtimeData<Category>(
    businessId,
    getCategories,
    'elm-pos:categories:changed',
    { silent: true }, // ignorer silencieusement en mode hors ligne
  );
  return { categories, loading, refetch };
}
