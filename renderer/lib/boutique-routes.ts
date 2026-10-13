'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { isCapacitor, isElectron } from './platform';

/**
 * Vitrine acheteur (/boutique/[businessId]) — routage commun web / builds statiques.
 *
 * L'export statique (Capacitor, Electron) ne génère qu'une page par route dynamique,
 * avec les valeurs factices de generateStaticParams. Sur ces builds, l'identifiant
 * réel voyage donc dans la query string : /boutique/boutique/?id=<ref>.
 */
const STATIC_BUSINESS = 'boutique';
const STATIC_ORDER    = 'confirmation';

const isStaticBuild = () => isCapacitor || isElectron;

export function boutiquePath(ref: string): string {
  return isStaticBuild()
    ? `/boutique/${STATIC_BUSINESS}/?id=${encodeURIComponent(ref)}`
    : `/boutique/${ref}`;
}

export function boutiqueConfirmationPath(ref: string, token: string): string {
  return isStaticBuild()
    ? `/boutique/${STATIC_BUSINESS}/confirmation/${STATIC_ORDER}/?id=${encodeURIComponent(ref)}&order=${encodeURIComponent(token)}`
    : `/boutique/${ref}/confirmation/${token}`;
}

export function useBoutiqueParams(): { businessId: string | null; orderToken: string | null } {
  const params = useParams<{ businessId?: string; orderId?: string }>();
  const search = useSearchParams();
  const fromRoute = (value: string | undefined, placeholder: string) =>
    value && value !== placeholder ? value : null;
  return {
    businessId: fromRoute(params.businessId, STATIC_BUSINESS) ?? search.get('id'),
    orderToken: fromRoute(params.orderId, STATIC_ORDER) ?? search.get('order'),
  };
}

/** Extrait la référence d'une boutique d'un lien partagé (…/boutique/<ref>) ou d'un code saisi. */
export function parseBoutiqueRef(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const fromLink = trimmed.match(/\/boutique\/([^/?#\s]+)/);
  if (fromLink) return decodeURIComponent(fromLink[1]);
  return /^[\w-]+$/.test(trimmed) ? trimmed : null;
}

// ─── Boutiques visitées (mémorisées sur l'appareil) ─────────────────────────

export interface RecentBoutique {
  id: string;
  name: string;
  logo_url: string | null;
  visitedAt: string;
}

const RECENT_KEY = 'elm-boutiques-recentes';
const RECENT_MAX = 20;

export function getRecentBoutiques(): RecentBoutique[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as RecentBoutique[]) : [];
  } catch {
    return [];
  }
}

export function rememberBoutique(b: Omit<RecentBoutique, 'visitedAt'>): void {
  try {
    const next = [
      { ...b, visitedAt: new Date().toISOString() },
      ...getRecentBoutiques().filter((r) => r.id !== b.id),
    ].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* stockage indisponible : non bloquant */ }
}

export function forgetBoutique(id: string): RecentBoutique[] {
  const next = getRecentBoutiques().filter((r) => r.id !== id);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}
