/**
 * Unwraps a Supabase query result, throwing on error.
 *
 * Usage:
 *   return q<Category[]>(supabase.from('categories').select('*'));
 *   await q(supabase.from('items').delete().eq('id', id));
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function q<T = unknown>(query: PromiseLike<{ data: any; error: any }>): Promise<T> {
  try {
    const { data, error } = await query;
    if (error) {
      console.error('[Supabase Query Error]', error);
      throw new Error(error.message || 'Unknown Supabase error');
    }
    return data as T;
  } catch (err: any) {
    if (err.message === 'Failed to fetch') {
      console.error('[Supabase Network Error] Check your connection or Supabase URL/Key.');
    }
    throw err;
  }
}
