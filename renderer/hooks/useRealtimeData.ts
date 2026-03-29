'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook générique : charge des données depuis Supabase et les rafraîchit
 * automatiquement quand un événement realtime est reçu.
 *
 * Usage :
 *   const { data, loading, error, refetch } = useRealtimeData(
 *     businessId,
 *     (id) => getCategories(id),
 *     'elm-pos:categories:changed',
 *   );
 */
export function useRealtimeData<T>(
  businessId: string,
  fetchFn: (businessId: string) => Promise<T[]>,
  realtimeEvent: string,
  options?: { silent?: boolean },
) {
  const [data, setData]       = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  // Stable ref pour fetchFn — évite de recréer le callback si la fonction change
  const fetchFnRef = useRef(fetchFn);
  fetchFnRef.current = fetchFn;

  const fetch = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFnRef.current(businessId);
      setData(result);
    } catch (err) {
      if (!options?.silent) setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [businessId, options?.silent]);

  // Chargement initial
  useEffect(() => { fetch(); }, [fetch]);

  // Mise à jour realtime (événements CustomEvent dispatché par useRealtimeSync)
  useEffect(() => {
    if (!businessId) return;
    const handler = () => { fetch(); };
    window.addEventListener(realtimeEvent, handler);
    return () => window.removeEventListener(realtimeEvent, handler);
  }, [businessId, fetch, realtimeEvent]);

  return { data, loading, error, refetch: fetch };
}
