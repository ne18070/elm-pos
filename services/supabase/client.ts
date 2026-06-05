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

// Promise-based mutex that serialises concurrent auth operations without
// ever using the Web Locks `steal` option.  The built-in Supabase lock uses
// steal:true for autoRefreshToken, which races with manual getUser() calls
// and produces "Lock released because another request stole it" errors.
const _lockQueues = new Map<string, Promise<unknown>>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _serialLock(name: string, _acquireTimeout: number, fn: () => Promise<any>): Promise<any> {
  const prev = _lockQueues.get(name) ?? Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(() => fn())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .finally(() => { if (_lockQueues.get(name) === next) _lockQueues.delete(name); });
  _lockQueues.set(name, next);
  return next;
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
      lock: _serialLock,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  }
);

export type SupabaseClient = typeof supabase;
