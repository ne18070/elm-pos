import { createClient } from '@supabase/supabase-js';

// Single source for the Supabase admin client (service role key).
// Import ONLY in server route handlers under app/api/ — never in renderer components.
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) throw new Error('Supabase admin credentials not configured');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
