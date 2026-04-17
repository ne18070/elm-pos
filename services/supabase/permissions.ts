import { supabase } from './client';
import type { PermissionKey } from '../../renderer/lib/permissions-map';

export interface PermissionOverride {
  permission: string;
  granted:    boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export async function getMyPermissions(businessId: string): Promise<Record<string, boolean>> {
  const { data, error } = await db.rpc('get_my_permissions', { p_business_id: businessId });
  if (error) throw new Error(error.message);
  const map: Record<string, boolean> = {};
  for (const row of (data ?? []) as PermissionOverride[]) {
    map[row.permission] = row.granted;
  }
  return map;
}

export async function getMemberPermissions(businessId: string, userId: string): Promise<Record<string, boolean>> {
  const { data, error } = await db.rpc('get_member_permissions', {
    p_business_id: businessId,
    p_user_id:     userId,
  });
  if (error) throw new Error(error.message);
  const map: Record<string, boolean> = {};
  for (const row of (data ?? []) as PermissionOverride[]) {
    map[row.permission] = row.granted;
  }
  return map;
}

export async function setMemberPermissionOverride(
  businessId: string,
  userId:     string,
  permission: PermissionKey,
  granted:    boolean,
): Promise<void> {
  const { error } = await db
    .from('member_permission_overrides')
    .upsert({ business_id: businessId, user_id: userId, permission, granted }, { onConflict: 'business_id,user_id,permission' });
  if (error) throw new Error(error.message);
}

export async function deleteMemberPermissionOverride(
  businessId: string,
  userId:     string,
  permission: PermissionKey,
): Promise<void> {
  const { error } = await db
    .from('member_permission_overrides')
    .delete()
    .eq('business_id', businessId)
    .eq('user_id', userId)
    .eq('permission', permission);
  if (error) throw new Error(error.message);
}
