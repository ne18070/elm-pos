'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getProducts } from '@services/supabase/products';
import { supabase } from '@/lib/supabase';
import type { Product } from '@pos-types';

export function useProducts(businessId: string, realtime = false) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

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

  // Chargement initial
  useEffect(() => { fetch(); }, [fetch]);

  // Abonnement Realtime — activé uniquement à la caisse (realtime=true)
  useEffect(() => {
    if (!realtime || !businessId) return;

    const channel = supabase
      .channel(`products:${businessId}`)
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'products',
          filter: `business_id=eq.${businessId}`,
        },
        (payload) => {
          // Mise à jour ciblée du produit modifié (stock, is_active…)
          setProducts((prev) =>
            prev.map((p) =>
              p.id === payload.new.id
                ? { ...p, ...(payload.new as Partial<Product>) }
                : p
            )
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'products',
          filter: `business_id=eq.${businessId}`,
        },
        () => {
          // Nouveau produit → recharger la liste complète (on veut le join category)
          fetch();
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [realtime, businessId, fetch]);

  return { products, loading, error, refetch: fetch };
}
