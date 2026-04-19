import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';

const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL     ?? 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder';

// createBrowserClient stores the session in cookies (accessible to middleware)
// while keeping localStorage persistence for backwards compatibility.
export const supabase = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

export type SupabaseClient = typeof supabase;
