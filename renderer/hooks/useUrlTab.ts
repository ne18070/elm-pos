'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Onglet de page porté par l'URL (`?tab=…`) : il survit au rafraîchissement,
 * au retour arrière et aux liens partagés ou d'onboarding (CLAUDE.md ›
 * Navigation — pas d'état piégé en mémoire). Remplace `useState` à l'identique.
 *
 * - `allowed` : onglets ouvrables (déjà filtrés par les droits), en tableau ou
 *   en fonction — la forme fonction n'est appelée qu'après le rendu, pour une
 *   liste calculée plus bas dans la page. Une valeur d'URL hors liste est
 *   ignorée, puis appliquée si elle le devient (droits chargés après coup),
 *   tant que l'utilisateur n'a pas choisi lui-même d'onglet.
 * - L'URL n'est lue qu'après le montage : le rendu pré-calculé affiche l'onglet
 *   par défaut (pas d'écart d'hydratation, pas de frontière Suspense comme en
 *   exigerait useSearchParams).
 * - `replaceState` : changer d'onglet n'empile pas d'historique, le bouton
 *   retour quitte la page. Next 14.2 synchronise son routeur avec cet appel.
 */
export function useUrlTab<T extends string>(
  fallback: T,
  allowed:  readonly T[] | (() => readonly T[]),
  param = 'tab',
): [T, (next: T) => void] {
  const [tab, setTabState] = useState<T>(fallback);
  // Onglet demandé par l'URL, en attente d'être ouvrable (null : rien à appliquer)
  const requested  = useRef<string | null>(null);
  // Dernière valeur d'URL prise en compte (undefined : pas encore lue)
  const urlValue   = useRef<string | null | undefined>(undefined);
  const allowedRef = useRef(allowed);
  allowedRef.current = allowed;

  // Après chaque rendu (vérifications triviales) : la liste peut changer à tout
  // moment, et un lien vers la même page avec un autre ?tab= ne remonte pas la
  // page (Next la re-rend seulement) — d'où la comparaison avec l'URL courante.
  useEffect(() => {
    const current = new URLSearchParams(window.location.search).get(param);
    if (current !== urlValue.current) {
      const firstRead = urlValue.current === undefined;
      urlValue.current = current;
      // Paramètre retiré par une navigation (lien vers la page nue) : onglet par défaut
      requested.current = current ?? (firstRead ? null : fallback);
    }
    const wanted = requested.current;
    if (!wanted) return;
    const source = allowedRef.current;
    const list   = typeof source === 'function' ? source() : source;
    if ((list as readonly string[]).includes(wanted)) {
      requested.current = null;
      setTabState(wanted as T);
    }
  });

  const setTab = useCallback((next: T) => {
    requested.current = null; // le choix de l'utilisateur l'emporte sur l'URL
    setTabState(next);
    const params = new URLSearchParams(window.location.search);
    if (next === fallback) params.delete(param);
    else params.set(param, next);
    // Notre propre écriture n'est pas une navigation à rejouer
    urlValue.current = next === fallback ? null : next;
    const qs = params.toString();
    window.history.replaceState(
      null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`,
    );
  }, [fallback, param]);

  return [tab, setTab];
}
