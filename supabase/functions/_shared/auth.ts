import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface Caller {
  userId:     string;
  businessId: string;
  role:       string;
}

/**
 * Résout l'appelant depuis son JWT et exige un rôle suffisant.
 * Lancer une pub engage de l'argent : on n'ouvre qu'à admin/owner par défaut.
 */
export async function requireCaller(
  req: Request,
  allowedRoles: string[] = ['admin', 'owner'],
): Promise<Caller> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) throw new HttpError(401, 'Non autorisé');

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: auth } = await userClient.auth.getUser();
  if (!auth?.user) throw new HttpError(401, 'Session invalide');

  const { data: profile } = await userClient
    .from('users')
    .select('id, role, business_id, is_superadmin')
    .eq('id', auth.user.id)
    .single();

  if (!profile?.business_id) throw new HttpError(403, 'Aucun business actif');

  const ok = allowedRoles.includes(profile.role) || profile.is_superadmin === true;
  if (!ok) throw new HttpError(403, 'Permission refusée');

  return { userId: profile.id, businessId: profile.business_id, role: profile.role };
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
