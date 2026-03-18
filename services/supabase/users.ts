import { supabase } from './client';
import type { User, UserRole } from '../../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (supabase as any).rpc.bind(supabase) as (fn: string, args?: Record<string, unknown>) => ReturnType<typeof supabase.rpc>;

// ─── Profil utilisateur ───────────────────────────────────────────────────────

export async function updateOwnProfile(
  userId: string,
  updates: { full_name?: string; avatar_url?: string }
): Promise<User> {
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as User;
}

// ─── Équipe (via business_members) ────────────────────────────────────────────

/**
 * Liste les membres d'un établissement.
 * Utilise get_business_members() RPC si disponible (migration 017),
 * sinon fallback sur l'ancienne requête directe.
 */
export async function getTeamMembers(businessId: string): Promise<User[]> {
  // Tenter d'abord le RPC (migration 017)
  const { data: rpcData, error: rpcError } = await rpc('get_business_members', { p_business_id: businessId });

  if (!rpcError && rpcData) {
    // Adapter le format rpc → User
    return (rpcData as Array<{
      user_id: string; full_name: string; email: string;
      avatar_url?: string; role: UserRole; joined_at: string;
    }>).map((m) => ({
      id:          m.user_id,
      full_name:   m.full_name,
      email:       m.email,
      avatar_url:  m.avatar_url,
      role:        m.role,
      business_id: businessId,
      created_at:  m.joined_at,
    } as User));
  }

  // Fallback : ancienne requête directe
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('business_id', businessId)
    .order('full_name');

  if (error) throw new Error(error.message);
  return data as User[];
}

/**
 * Changer le rôle d'un membre.
 * Utilise set_member_role() RPC (migration 017) avec fallback.
 */
export async function updateUserRole(userId: string, role: UserRole, businessId?: string): Promise<void> {
  if (businessId) {
    const { error } = await rpc('set_member_role', {
      p_business_id: businessId,
      p_user_id:     userId,
      p_role:        role,
    });
    if (!error) return;
  }

  // Fallback
  const { error } = await supabase
    .from('users')
    .update({ role })
    .eq('id', userId);
  if (error) throw new Error(error.message);
}

/**
 * Retirer un membre de l'établissement.
 * Utilise remove_business_member() RPC (migration 017) avec fallback.
 */
export async function removeUserFromBusiness(userId: string, businessId?: string): Promise<void> {
  if (businessId) {
    const { error } = await rpc('remove_business_member', {
      p_business_id: businessId,
      p_user_id:     userId,
    });
    if (!error) return;
  }

  // Fallback
  const { error } = await supabase
    .from('users')
    .update({ business_id: null })
    .eq('id', userId);
  if (error) throw new Error(error.message);
}

// ─── Invitation (via Edge Function) ───────────────────────────────────────────

export interface InvitePayload {
  email: string;
  full_name: string;
  role: UserRole;
  business_id: string;
}

export async function inviteUser(payload: InvitePayload): Promise<void> {
  const { error } = await supabase.functions.invoke('invite-user', {
    body: payload,
  });
  if (error) throw new Error(error.message);
}
