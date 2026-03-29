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
