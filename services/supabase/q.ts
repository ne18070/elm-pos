/**
 * Unwraps a Supabase query result, throwing on error.
 *
 * Usage:
 *   return q<Category[]>(supabase.from('categories').select('*'));
 *   await q(supabase.from('items').delete().eq('id', id));
 */
export async function q<T = unknown>(
  query: PromiseLike<{ data: T | null; error: { message: string } | null }>,
): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as T;
}
