import { checkPermission } from './permissions';
import { NAV_ITEMS } from './nav-config';
import type { UserRole, Business } from '@pos-types';
import { isCapacitor } from './platform';
import { getBusinessKind } from '@/lib/business-kind';

/**
 * Retourne la première route accessible selon les permissions de l'utilisateur.
 * Utilisé après login, switch de business, ou création d'établissement.
 */
export function getDefaultRoute(
  role: UserRole | null | undefined,
  business: Business | null | undefined,
  overrides: Record<string, boolean> = {}
): string {
  if (isCapacitor) {
    // Managers et owners → stats
    if (role === 'owner' || role === 'admin' || role === 'manager') return '/m/owner';

    // Staff → page opérationnelle selon le type de business
    const kind = getBusinessKind(business ?? null);
    const staffRoutes: Record<typeof kind, string> = {
      boutique:  '/m/inventory',
      restaurant:'/m/orders',
      location:  '/m/contrats',
      service:   '/m/services',
      juridique: '/m/dossiers',
      autre:     '/m/orders',
    };
    return staffRoutes[kind];
  }

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
