import { supabase } from './client';
import type { User, UserRole } from '../../types';

// ─── Équipe ───────────────────────────────────────────────────────────────────

export async function getTeamMembers(businessId: string): Promise<User[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('business_id', businessId)
    .order('full_name');

  if (error) throw new Error(error.message);
  return data as User[];
}

export async function updateUserRole(userId: string, role: UserRole): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ role })
    .eq('id', userId);

  if (error) throw new Error(error.message);
}

export async function removeUserFromBusiness(userId: string): Promise<void> {
  // Retire l'utilisateur du business sans supprimer son compte
  const { error } = await supabase
    .from('users')
    .update({ business_id: null })
    .eq('id', userId);

  if (error) throw new Error(error.message);
}

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
