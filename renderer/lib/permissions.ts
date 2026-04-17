import type { UserRole } from '@pos-types';

// ─── Hiérarchie des rôles ─────────────────────────────────────────────────────
// Plus le rang est élevé, plus le rôle a de permissions.

const ROLE_RANK: Record<UserRole, number> = {
  staff:   0,
  manager: 1,
  admin:   2,
  owner:   3,
};

/**
 * Retourne true si le rôle de l'utilisateur est >= au rôle minimum requis.
 *
 * @example
 * hasRole(user?.role, 'manager') // true pour manager, admin, owner
 * hasRole(user?.role, 'admin')   // true pour admin et owner seulement
 */
export function hasRole(
  userRole: UserRole | undefined | null,
  minRole: UserRole,
): boolean {
  return (ROLE_RANK[userRole ?? 'staff'] ?? 0) >= ROLE_RANK[minRole];
}

// ─── Labels lisibles ──────────────────────────────────────────────────────────

export const ROLE_LABEL: Record<UserRole, string> = {
  owner:   'Propriétaire',
  admin:   'Administrateur',
  manager: 'Manager',
  staff:   'Caissier',
};

export function getRoleLabel(role: UserRole | undefined | null): string {
  return ROLE_LABEL[role ?? 'staff'] ?? 'Caissier';
}

// ─── Permissions nommées ──────────────────────────────────────────────────────
// Utiliser ces fonctions dans les composants pour une meilleure lisibilité.

/** Peut voir les données financières (balance, états financiers, caisse) */
export const canViewFinancials    = (r: UserRole | null | undefined) => hasRole(r, 'admin');

/** Peut gérer les paramètres (établissement, stock, templates, type) */
export const canManageSettings    = (r: UserRole | null | undefined) => hasRole(r, 'manager');

/** Peut annuler des commandes / réservations */
export const canCancelOrders      = (r: UserRole | null | undefined) => hasRole(r, 'manager');

/** Peut créer / modifier / supprimer des chambres */
export const canManageRooms       = (r: UserRole | null | undefined) => hasRole(r, 'manager');

/** Peut voir et enregistrer des dépenses */
export const canManageExpenses    = (r: UserRole | null | undefined) => hasRole(r, 'manager');

/** Peut gérer l'équipe (invitations, rôles) */
export const canManageTeam        = (r: UserRole | null | undefined) => hasRole(r, 'admin');

/** Peut supprimer des données critiques */
export const canDelete            = (r: UserRole | null | undefined) => hasRole(r, 'admin');

// ─── Permissions granulaires ──────────────────────────────────────────────────

import type { PermissionKey } from './permissions-map';
import { PERMISSIONS, IMMUTABLE_OWNER_PERMISSIONS } from './permissions-map';

/**
 * Resolves a single permission given a role and optional per-member overrides.
 * Override map keys are permission keys, values are granted (true) or denied (false).
 * Owner always has IMMUTABLE_OWNER_PERMISSIONS regardless of overrides.
 */
export function checkPermission(
  role:       UserRole | null | undefined,
  permission: PermissionKey,
  overrides:  Record<string, boolean> = {},
): boolean {
  const r = role ?? 'staff';

  // Owners cannot have critical permissions denied
  if (r === 'owner' && (IMMUTABLE_OWNER_PERMISSIONS as readonly string[]).includes(permission)) {
    return true;
  }

  // Explicit override wins over role default
  if (permission in overrides) {
    return overrides[permission];
  }

  // Fall back to role default
  const meta = PERMISSIONS[permission];
  if (!meta) return false;
  return (meta.defaultRoles as readonly string[]).includes(r);
}
