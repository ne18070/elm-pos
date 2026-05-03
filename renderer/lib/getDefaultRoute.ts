import { checkPermission } from './permissions';
import { NAV_ITEMS } from './nav-config';
import type { UserRole, Business } from '@pos-types';

/**
 * Retourne la première route accessible selon les permissions de l'utilisateur.
 * Utilisé après login, switch de business, ou création d'établissement.
 */
export function getDefaultRoute(
  role: UserRole | null | undefined, 
  business: Business | null | undefined,
  overrides: Record<string, boolean> = {}
): string {
  // On parcourt NAV_ITEMS dans l'ordre (défini par NAV_SECTIONS)
  // et on retourne la première route autorisée.
  for (const item of NAV_ITEMS) {
    if (!item.permission || checkPermission(role, item.permission, overrides, business)) {
      return item.href;
    }
  }

  // Fallback si rien n'est autorisé (théoriquement impossible car analytics ou orders sont ouverts)
  return '/orders';
}
