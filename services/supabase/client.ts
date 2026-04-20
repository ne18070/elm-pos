import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';

// On essaie de lire les deux variantes pour être sûr
const supabaseUrl = 
  process.env.NEXT_PUBLIC_SUPABASE_URL || 
  process.env.SUPABASE_URL;

const supabaseAnonKey = 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
  process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey || supabaseAnonKey === 'placeholder') {
  console.error('ERREUR : Supabase URL ou Anon Key manquante ! Vérifiez votre fichier .env et redémarrez.');
}

export const supabase = createBrowserClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseAnonKey || 'placeholder', 
  {
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  }
);

export type SupabaseClient = typeof supabase;
