'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getDeliveryQueueSummary } from '@services/supabase/orders';

/** Au-delà, une commande qui attend son livreur est considérée en retard. */
export const DELIVERY_LATE_AFTER_MS = 2 * 60 * 60 * 1000;

/**
 * Compteur de la file de livraison pour la navigation : nombre de commandes à
 * remettre, et `late` dès que la plus ancienne attend depuis plus de 2 h.
 * Rafraîchi par le canal temps réel central (`elm-pos:orders:changed`, émis
 * par useRealtimeSync) et toutes les minutes pour faire vieillir le statut.
 */
export function useDeliveryQueue(businessId: string, enabled: boolean) {
  const [count, setCount]       = useState(0);
  const [oldestAt, setOldestAt] = useState<string | null>(null);
  const [now, setNow]           = useState(() => Date.now());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (!businessId || !enabled) return;
    try {
      const s = await getDeliveryQueueSummary(businessId);
      setCount(s.count);
      setOldestAt(s.oldestAt);
    } catch {
      /* badge indicatif : on garde la dernière valeur */
    }
  }, [businessId, enabled]);

  useEffect(() => {
    if (!enabled) { setCount(0); setOldestAt(null); return; }
    refresh();
  }, [enabled, refresh]);

  useEffect(() => {
    if (!businessId || !enabled) return;
    // Une rafale de changements (paiement + articles) → une seule requête.
    const onChange = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(refresh, 800);
    };
    window.addEventListener('elm-pos:orders:changed', onChange);
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      window.removeEventListener('elm-pos:orders:changed', onChange);
      clearInterval(tick);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [businessId, enabled, refresh]);

  const late = !!oldestAt && now - new Date(oldestAt).getTime() > DELIVERY_LATE_AFTER_MS;
  return { count, late, refresh };
}
