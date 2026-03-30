/**
 * Unwraps a Supabase query result, throwing on error.
 *
 * Usage:
 *   return q<Category[]>(supabase.from('categories').select('*'));
 *   await q(supabase.from('items').delete().eq('id', id));
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function q<T = unknown>(query: PromiseLike<{ data: any; error: any }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as T;
}
