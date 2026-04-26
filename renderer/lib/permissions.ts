import type { UserRole, Business } from '@pos-types';

// --- Hiérarchie des rôles -----------------------------------------------------
// Plus le rang est élevé, plus le rôle a de permissions.

const ROLE_RANK: Record<UserRole, number> = {
  staff:   0,
  manager: 1,
  admin:   2,
  owner:   3,
};

/**
 * Retourne true si le rôle de l'utilisateur est >= au rôle minimum requis.
 */
export function hasRole(
  userRole: UserRole | undefined | null,
  minRole: UserRole,
): boolean {
  return (ROLE_RANK[userRole ?? 'staff'] ?? 0) >= ROLE_RANK[minRole];
}

/**
 * Retourne true si l'établissement possède le module/feature spécifié.
 */
export function hasFeature(business: Business | null | undefined, feature: string): boolean {
  if (!business) return false;

  const types = business.types ?? [];
  const features = business.features ?? [];

  // Un business peut avoir plusieurs types (ex: restaurant + retail)
  if (types.includes(feature)) return true;

  // Implis par type
  if (types.includes('juridique') && (feature === 'dossiers' || feature === 'honoraires')) return true;
  if (types.includes('restaurant') && (feature === 'restaurant' || feature === 'retail')) return true;
  if (types.includes('hotel') && (feature === 'hotel' || feature === 'retail')) return true;

  // Ou des modules activés explicitement
  return features.includes(feature);
}

// --- Labels lisibles ----------------------------------------------------------

export const ROLE_LABEL: Record<UserRole, string> = {
  owner:   'Propriétaire',
  admin:   'Administrateur',
  manager: 'Manager',
  staff:   'Caissier',
};

export function getRoleLabel(role: UserRole | undefined | null): string {
  return ROLE_LABEL[role ?? 'staff'] ?? 'Caissier';
}

// --- Permissions nommées ------------------------------------------------------

/** Peut voir les données financières (balance, états financiers, caisse) */
export const canViewFinancials    = (r: UserRole | null | undefined) => hasRole(r, 'admin');

/** Peut gérer les paramètres (établissement, stock, templates, type) */
export const canManageSettings    = (r: UserRole | null | undefined) => hasRole(r, 'manager');

/** Peut annuler des commandes / réservations */
export const canCancelOrders      = (r: UserRole | null | undefined, b?: Business | null) => 
  hasRole(r, 'manager') && (!b || hasFeature(b, 'retail'));

/** Peut créer / modifier / supprimer des chambres */
export const canManageRooms       = (r: UserRole | null | undefined, b?: Business | null) => 
  hasRole(r, 'manager') && (!b || hasFeature(b, 'hotel'));

/** Peut voir et enregistrer des dépenses */
export const canManageExpenses    = (r: UserRole | null | undefined, b?: Business | null) => 
  hasRole(r, 'manager') && (!b || hasFeature(b, 'expenses'));

/** Peut gérer l'équipe (invitations, rôles) */
export const canManageTeam        = (r: UserRole | null | undefined) => hasRole(r, 'admin');

/** Peut supprimer des données critiques */
export const canDelete            = (r: UserRole | null | undefined) => hasRole(r, 'admin');

// --- Permissions granulaires --------------------------------------------------

import type { PermissionKey } from './permissions-map';
import { PERMISSIONS, IMMUTABLE_OWNER_PERMISSIONS } from './permissions-map';

/**
 * Resolves a single permission given a role, an optional business and optional per-member overrides.
 */
export function checkPermission(
  role:       UserRole | null | undefined,
  permission: PermissionKey,
  overrides:  Record<string, boolean> = {},
  business?:  Business | null
): boolean {
  const r = role ?? 'staff';

  // Fall back to role default
  const meta = PERMISSIONS[permission];
  if (!meta) return false;

  // 1. Check feature requirement first
  if (meta.feature && business && !hasFeature(business, meta.feature)) {
    return false;
  }

  // 2. Owners cannot have critical permissions denied
  if (r === 'owner' && (IMMUTABLE_OWNER_PERMISSIONS as readonly string[]).includes(permission)) {
    return true;
  }

  // 3. Explicit override wins over role default
  if (permission in overrides) {
    return overrides[permission];
  }

  // 4. Role default check
  return (meta.defaultRoles as readonly string[]).includes(r);
}
