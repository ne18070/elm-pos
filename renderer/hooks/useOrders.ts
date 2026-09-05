'use client';

import { useState, useEffect, useCallback } from 'react';
import { getOrders } from '@services/supabase/orders';
import type { Order } from '@pos-types';

interface UseOrdersOptions {
  status?:   string;
  limit?:    number;
  offset?:   number;
  date?:     string;
  dateFrom?: string;
  dateTo?:   string;
  search?:   string;
  cashierId?:    string;
  createdAfter?: string;
}

export function useOrders(businessId: string, options?: UseOrdersOptions) {
  const [orders, setOrders]   = useState<Order[]>([]);
  const [count, setCount]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

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
  }, [businessId, options?.status, options?.date, options?.dateFrom, options?.dateTo, options?.limit, options?.offset, options?.search, options?.cashierId, options?.createdAfter]);

  useEffect(() => { fetch(); }, [fetch]);

  // Real-time: refetch when any terminal creates/updates an order
  useEffect(() => {
    if (!businessId) return;
    const handler = () => { fetch(); };
    window.addEventListener('elm-pos:orders:changed', handler);
    return () => window.removeEventListener('elm-pos:orders:changed', handler);
  }, [businessId, fetch]);

  // Mise à jour optimiste d'une commande déjà en mémoire (ex: paiement du
  // solde d'un acompte) — évite d'attendre un aller-retour réseau complet
  // (refetch) juste pour que la ligne de la liste reflète le nouvel état.
  // Le refetch en tâche de fond (déclenché en parallèle) reste la source de
  // vérité et corrige silencieusement cette mise à jour si besoin.
  const patchOrder = useCallback((id: string, updater: (order: Order) => Order) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? updater(o) : o)));
  }, []);

  return { orders, count, loading, error, refetch: fetch, patchOrder };
}
