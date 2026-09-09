'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  acompteOnly?:  boolean;
  withCount?:    boolean;
  projection?:   'full' | 'list';
}

export function useOrders(businessId: string, options?: UseOrdersOptions) {
  const [orders, setOrders]   = useState<Order[]>([]);
  const [count, setCount]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  // Compteur de requêtes : plusieurs fetch() peuvent se chevaucher (frappe
  // rapide malgré le debounce côté page, refetch temps réel déclenché pendant
  // qu'une recherche est encore en vol...). Sans garde, la réponse la plus
  // ANCIENNE peut arriver APRÈS la plus récente (réseau, requête plus lourde
  // sur un gros historique) et écraser un résultat à jour avec des données
  // périmées. On n'applique que la réponse de la dernière requête lancée.
  const requestIdRef = useRef(0);

  const fetch = useCallback(async () => {
    // businessId vide = requête volontairement désactivée (business/user pas
    // encore chargé, ou source dédoublonnée) : on retombe sur un état neutre
    // plutôt que de laisser `loading` à true indéfiniment.
    if (!businessId) { requestIdRef.current++; setOrders([]); setCount(0); setLoading(false); return; }
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await getOrders(businessId, options);
      if (requestId !== requestIdRef.current) return; // réponse périmée, ignorée
      setOrders(result.orders);
      setCount(result.count);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(String(err));
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, options?.status, options?.date, options?.dateFrom, options?.dateTo, options?.limit, options?.offset, options?.search, options?.cashierId, options?.createdAfter, options?.acompteOnly, options?.withCount, options?.projection]);

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
