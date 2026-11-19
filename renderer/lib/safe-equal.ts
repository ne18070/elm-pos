import { timingSafeEqual } from 'crypto';

/**
 * Comparaison en temps constant (secrets de webhook, signatures) : ne révèle pas
 * par le temps de réponse combien de caractères correspondent. Longueurs
 * différentes → faux, sans comparer.
 */
export function safeEqual(a: string | Buffer, b: string | Buffer): boolean {
  const left = typeof a === 'string' ? Buffer.from(a) : a;
  const right = typeof b === 'string' ? Buffer.from(b) : b;
  return left.length === right.length && timingSafeEqual(left, right);
}
