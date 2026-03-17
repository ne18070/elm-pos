import { supabase } from './client';
import type { User } from '../../types';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResult {
  user: User | null;
  error: string | null;
}

export async function login(credentials: LoginCredentials): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signInWithPassword(credentials);

  if (error) {
    return { user: null, error: error.message };
  }

  if (!data.user) {
    return { user: null, error: 'No user returned' };
  }

  // Fetch full user profile with role
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('*')
    .eq('id', data.user.id)
    .single();

  if (profileError) {
    return { user: null, error: profileError.message };
  }

  return { user: profile as User, error: null };
}

export async function logout(): Promise<void> {
  await supabase.auth.signOut();
}

export async function getCurrentUser(): Promise<User | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  return (profile as User) || null;
}

export async function updatePassword(newPassword: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return { error: error?.message ?? null };
}

export function onAuthStateChange(
  callback: (user: User | null) => void
): { unsubscribe: () => void } {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
    if (!session?.user) {
      callback(null);
      return;
    }
    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', session.user.id)
      .single();
    callback((profile as User) || null);
  });

  return { unsubscribe: () => subscription.unsubscribe() };
}
