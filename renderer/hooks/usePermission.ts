'use client';

import { useAuthStore } from '@/store/auth';
import { usePermissionsStore } from '@/store/permissions';
import { checkPermission } from '@/lib/permissions';
import type { PermissionKey } from '@/lib/permissions';

/**
 * Returns true if the current user has the given permission,
 * taking role defaults and per-member overrides into account.
 */
export function usePermission(permission: PermissionKey): boolean {
  const role      = useAuthStore((s) => s.user?.role ?? null);
  const business  = useAuthStore((s) => s.business);
  const overrides = usePermissionsStore((s) => s.overrides);
  return checkPermission(role, permission, overrides, business);
}

/**
 * Returns a function `can(permission)` for checking multiple permissions
 * without subscribing to each individually.
 */
export function useCan(): (permission: PermissionKey) => boolean {
  const role      = useAuthStore((s) => s.user?.role ?? null);
  const business  = useAuthStore((s) => s.business);
  const overrides = usePermissionsStore((s) => s.overrides);
  return (permission: PermissionKey) => checkPermission(role, permission, overrides, business);
}
