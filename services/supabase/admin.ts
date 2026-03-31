import { createClient } from '@supabase/supabase-js';

const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
                    ?? process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
                    ?? '';

/**
 * Admin client with service_role key.
 * Only used in the backoffice (admin-only screens).
 * This is safe because the app is a desktop Electron app — not a public web server.
 */
export const supabaseAdmin = createClient(supabaseUrl || 'https://placeholder.supabase.co', serviceRoleKey || 'placeholder', {
  auth: { autoRefreshToken: false, persistSession: false },
});
