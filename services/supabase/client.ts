import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = 
  process.env.NEXT_PUBLIC_SUPABASE_URL || 
  process.env.SUPABASE_URL || 
  'https://placeholder.supabase.co';

const supabaseAnonKey = 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
  process.env.SUPABASE_ANON_KEY || 
  'placeholder';

if (supabaseUrl.includes('placeholder') || supabaseAnonKey === 'placeholder') {
  console.error('ERREUR : Supabase URL ou Anon Key manquante !');
}

export const supabase = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  }
);

export type SupabaseClient = typeof supabase;
