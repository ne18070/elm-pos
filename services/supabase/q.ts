import { supabase } from './client';

/**
 * Unwraps a Supabase query result, throwing on error.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function q<T = unknown>(query: PromiseLike<{ data: any; error: any }>, queryName?: string): Promise<T> {
  const start = Date.now();
  try {
    const { data, error } = await query;
    const duration = Date.now() - start;

    if (error) {
      console.error('[Supabase Query Error]', error);
      
      // Log technique (auto-instrumentation)
      // On évite de logger si l'erreur vient de la table de monitoring elle-même
      if (queryName !== 'monitoring_vitals_insert') {
        supabase.from('monitoring_vitals').insert({
          level: 'error',
          category: 'sql',
          message: error.message || 'Supabase Error',
          context: { error, queryName, duration },
          latency_ms: duration,
          url: typeof window !== 'undefined' ? window.location.pathname : 'server'
        }).then(() => {}).catch(() => {});
      }

      throw new Error(error.message || 'Unknown Supabase error');
    }

    // Log performance si lent (> 500ms)
    if (duration > 500 && queryName !== 'monitoring_vitals_insert') {
      supabase.from('monitoring_vitals').insert({
        level: 'perf',
        category: 'sql',
        message: `Slow Query: ${queryName || 'unknown'}`,
        latency_ms: duration,
        context: { queryName },
        url: typeof window !== 'undefined' ? window.location.pathname : 'server'
      }).then(() => {}).catch(() => {});
    }

    return data as T;
  } catch (err: any) {
    if (err.message === 'Failed to fetch') {
      console.error('[Supabase Network Error] Check your connection or Supabase URL/Key.');
    }
    throw err;
  }
}
