'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getOrders, type OrderCursor } from '@services/supabase/orders';
import type { Order } from '@pos-types';

interface UseOrdersOptions {
  status?:   string;
  limit?:    number;
  /** Curseur keyset de la page demandée (omis = 1re page) — cf. getOrders. */
  before?:   OrderCursor;
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
  const [orders, setOrders]         = useState<Order[]>([]);
  const [count, setCount]           = useState(0);
  const [rawHasMore, setRawHasMore] = useState(false);
  const [rawNext, setRawNext]       = useState<OrderCursor | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  // Clé des filtres auxquels correspondent RÉELLEMENT `orders` / `rawHasMore`
  // / `rawNext` en state — voir `hasMore` plus bas.
  const [resultKey, setResultKey]   = useState('');

  // Clé de FILTRAGE (hors curseur / limit / projection / withCount). Deux jeux
  // de filtres différents ⇒ deux jeux de résultats différents.
  const filterKey = JSON.stringify([
    businessId,
    options?.status ?? '',
    options?.date ?? '',
    options?.dateFrom ?? '',
    options?.dateTo ?? '',
    options?.search ?? '',
    options?.cashierId ?? '',
    options?.createdAfter ?? '',
    options?.acompteOnly ?? false,
  ]);

  // Séquencement : plusieurs fetchs peuvent partir en parallèle (frappe /
  // pagination rapides). On n'applique QUE le résultat de la requête la plus
  // récente.
  const reqIdRef = useRef(0);

  const fetch = useCallback(async () => {
    const myId = ++reqIdRef.current;
    // businessId vide = requête volontairement désactivée (business/user pas
    // encore chargé) : état neutre plutôt qu'un `loading` infini.
    if (!businessId) {
      setOrders([]); setCount(0); setRawHasMore(false); setRawNext(null); setResultKey(filterKey); setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await getOrders(businessId, options);
      if (myId !== reqIdRef.current) return; // requête supplantée
      setOrders(result.orders);
      setRawHasMore(result.hasMore);
      setRawNext(result.nextCursor);
      // getOrders ne calcule le count que pour la 1re page — il ne change pas
      // d'une page à l'autre, on conserve celui de la 1re page.
      if (result.count !== null) setCount(result.count);
      setResultKey(filterKey);
    } catch (err) {
      if (myId !== reqIdRef.current) return;
      setError(String(err));
    } finally {
      if (myId === reqIdRef.current) setLoading(false);
    }
  // filterKey couvre status / date / search / cashierId / createdAfter / acompteOnly.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, filterKey, options?.before?.created_at, options?.before?.id, options?.limit, options?.withCount, options?.projection]);

  useEffect(() => { fetch(); }, [fetch]);

  // Temps réel : refetch quand une commande est créée / modifiée ailleurs.
  useEffect(() => {
    if (!businessId) return;
    const handler = () => { fetch(); };
    window.addEventListener('elm-pos:orders:changed', handler);
    return () => window.removeEventListener('elm-pos:orders:changed', handler);
  }, [businessId, fetch]);

  // Mise à jour optimiste d'une commande déjà en mémoire (ex: paiement du solde
  // d'un acompte) — évite d'attendre le refetch réseau juste pour rafraîchir la
  // ligne. Le refetch en tâche de fond reste la source de vérité.
  const patchOrder = useCallback((id: string, updater: (order: Order) => Order) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? updater(o) : o)));
  }, []);

  // `hasMore` / `nextCursor` ne sont FIABLES que si les données en state
  // correspondent aux filtres courants. Sinon on renvoie false / null, de façon
  // synchrone dès le rendu où les filtres changent : « Suivant » se désactive
  // sans attendre l'effet de fetch, aucun curseur d'un jeu périmé ne peut être
  // empilé.
  const current    = resultKey === filterKey;
  const hasMore    = current && rawHasMore;
  const nextCursor = current ? rawNext : null;

  return { orders, count, hasMore, nextCursor, loading, error, refetch: fetch, patchOrder };
}
