'use client';

import { useState, useEffect, useCallback } from 'react';
import { getProducts } from '@services/supabase/products';
import type { Product } from '@pos-types';

interface UseProductsOptions {
  /** Inclure les produits archivés (is_active = false). Défaut : false. */
  includeInactive?: boolean;
}

// `realtime` param kept for backward compatibility but no longer creates its own
// channel — real-time updates come from the central useRealtimeSync() channel
// mounted in the dashboard layout via CustomEvents.
export function useProducts(
  businessId: string,
  _realtime = false,
  opts: UseProductsOptions = {},
) {
  const { includeInactive = false } = opts;
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!businessId) {
      // Pas de business (encore) : ne pas rester bloqué sur "Chargement…"
      setProducts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getProducts(businessId, { includeInactive });
      setProducts(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [businessId, includeInactive]);

  // Initial load
  useEffect(() => { fetch(); }, [fetch]);

  // Real-time updates via central channel (useRealtimeSync dispatches this event)
  useEffect(() => {
    if (!businessId) return;

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { eventType: string; record?: Partial<Product> } | undefined;

      if (detail?.eventType === 'UPDATE' && detail.record?.id) {
        const rec = detail.record;
        // Un produit archivé ailleurs disparaît de la liste (sauf si on affiche
        // les archivés).
        if (rec.is_active === false && !includeInactive) {
          setProducts((prev) => prev.filter((p) => p.id !== rec.id));
          return;
        }
        // Mise à jour ciblée en place — évite un refetch complet pour un
        // changement de stock. On préserve la jointure `category` locale si le
        // payload realtime ne la contient pas.
        setProducts((prev) =>
          prev.map((p) =>
            p.id === rec.id ? { ...p, ...rec, category: (rec as Partial<Product>).category ?? p.category } : p
          )
        );
      } else {
        // INSERT or DELETE → full refetch to get category join
        fetch();
      }
    };

    window.addEventListener('elm-pos:products:changed', handler);
    return () => window.removeEventListener('elm-pos:products:changed', handler);
  }, [businessId, fetch, includeInactive]);

  return { products, loading, error, refetch: fetch };
}
