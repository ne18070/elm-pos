import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export type SuperadminContext = { admin: SupabaseClient; userId: string };

/**
 * Vérifie que l'appelant (Bearer = access token Supabase) est superadmin.
 * Renvoie le client admin à utiliser dans la route, ou la réponse d'erreur à retourner.
 * Import ONLY in server route handlers under app/api/.
 */
export async function requireSuperadmin(
  req: NextRequest,
): Promise<SuperadminContext | { response: NextResponse }> {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) {
    return { response: NextResponse.json({ error: 'Token manquant' }, { status: 401 }) };
  }

  let admin: SupabaseClient;
  try {
    admin = getSupabaseAdmin();
  } catch {
    return { response: NextResponse.json({ error: 'Configuration serveur incomplète' }, { status: 500 }) };
  }

  const { data: { user }, error } = await admin.auth.getUser(auth.slice(7));
  if (error || !user) {
    return { response: NextResponse.json({ error: 'Session invalide ou expirée. Reconnectez-vous.' }, { status: 401 }) };
  }

  const { data: profile } = await admin.from('users').select('is_superadmin').eq('id', user.id).single();
  if (!profile?.is_superadmin) {
    return { response: NextResponse.json({ error: 'Accès superadmin requis' }, { status: 403 }) };
  }

  return { admin, userId: user.id };
}
