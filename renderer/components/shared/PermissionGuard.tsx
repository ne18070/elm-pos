'use client';

import type { PermissionKey } from '@/lib/permissions';
import { usePermission } from '@/hooks/usePermission';

interface Props {
  permission: PermissionKey;
  fallback?:  React.ReactNode;
  children:   React.ReactNode;
}

/**
 * Renders children only if the current user has the given permission.
 * Shows `fallback` (default: null) otherwise.
 */
export function PermissionGuard({ permission, fallback = null, children }: Props) {
  const allowed = usePermission(permission);
  return allowed ? <>{children}</> : <>{fallback}</>;
}
