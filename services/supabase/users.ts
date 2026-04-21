import { createClient } from '@supabase/supabase-js';
import { supabase } from './client';
import type { User, UserRole } from '../../types';

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
  const { data: rpcData, error: rpcError } = await supabase
    .rpc('get_business_members', { p_business_id: businessId });

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
    const { error } = await supabase.rpc('set_member_role', {
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
    const { error } = await supabase.rpc('remove_business_member', {
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

// ─── Blocage + reset MDP (owner only) ────────────────────────────────────────

export async function toggleUserBlock(
  businessId: string,
  userId: string,
  blocked: boolean
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('toggle_user_block', {
    p_business_id: businessId,
    p_user_id:     userId,
    p_blocked:     blocked,
  });
  if (error) throw new Error(error.message);
}

export async function adminResetUserPassword(
  business_id: string,
  user_id: string,
  newPassword: string
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('admin_reset_user_password', {
    p_business_id:  business_id,
    p_user_id:      user_id,
    p_new_password: newPassword,
  });
  if (error) throw new Error(error.message);
}

/** Créer un utilisateur et l'attacher à un établissement (réservé aux superadmins) */
export async function createBusinessAdmin(data: {
  email:     string;
  password:  string;
  full_name: string;
  business_id: string;
  role?:     UserRole;
}): Promise<string> {
  const { supabaseAdmin } = await import('./admin');
  if (!supabaseAdmin) throw new Error("Accès refusé : clé de service manquante.");

  // 1. Créer l'utilisateur Auth
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email:          data.email,
    password:       data.password,
    email_confirm:  true,
    user_metadata: {
      full_name:   data.full_name,
      role:        data.role || 'owner',
      business_id: data.business_id,
    }
  });
  if (authError) throw new Error(authError.message);
  const userId = authData.user!.id;

  // 2. Créer/Mettre à jour le profil public (le trigger handle_new_user s'en occupe normalement)
  const { error: profileError } = await supabaseAdmin.from('users').upsert({
    id:          userId,
    email:       data.email,
    full_name:   data.full_name,
    role:        data.role || 'owner',
    business_id: data.business_id,
  });
  if (profileError) throw new Error(profileError.message);

  // 3. Ajouter aux membres du business
  const { error: memberError } = await supabaseAdmin.from('business_members').upsert({
    business_id: data.business_id,
    user_id:     userId,
    role:        data.role || 'owner',
  });
  if (memberError) throw new Error(memberError.message);

  // 4. Si c'est un owner, on met à jour le business.owner_id
  if ((data.role || 'owner') === 'owner') {
    const { error: bizError } = await supabaseAdmin
      .from('businesses')
      .update({ owner_id: userId })
      .eq('id', data.business_id);
    if (bizError) throw new Error(bizError.message);
  }

  return userId;
}

// ─── Création de compte membre ────────────────────────────────────────────────
// Utilise un client temporaire (sans persistance de session) pour ne pas
// déconnecter l'admin en cours de session.

export interface InvitePayload {
  email:          string;
  full_name:      string;
  role:           UserRole;
  business_id:    string;
  password?:      string;   // absent = utilisateur existant
  existing_user?: boolean;
}

export async function inviteUser(payload: InvitePayload): Promise<void> {
  if (!payload.existing_user && payload.password) {
    // ── Nouveau compte ──────────────────────────────────────────────────────
    const tmp = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { error } = await tmp.auth.signUp({
      email:    payload.email,
      password: payload.password,
      options: {
        data: {
          full_name:   payload.full_name,
          role:        payload.role,
          business_id: payload.business_id,
        },
      },
    });

    // unexpected_failure = trigger a échoué mais auth user est créé quand même
    if (error && error.code !== 'unexpected_failure') {
      throw new Error(error.message);
    }
  }

  // Ajouter/lier à ce business (fonctionne pour nouveau ET utilisateur existant)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: rpcError } = await (supabase as any).rpc('assign_user_to_business', {
    p_email:       payload.email,
    p_full_name:   payload.full_name,
    p_role:        payload.role,
    p_business_id: payload.business_id,
  });

  if (rpcError) throw new Error(rpcError.message);
}

