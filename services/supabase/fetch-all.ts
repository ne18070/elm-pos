const PAGE_SIZE = 1000;

type Rows<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/**
 * PostgREST plafonne toute requête sans .range() explicite à 1000 lignes
 * (`max_rows` dans supabase/config.toml) — silencieusement, sans erreur. Cette
 * fonction feuillette la requête par pages de 1000 jusqu'à épuisement.
 *
 * La requête construite DOIT avoir un tri total (ex. `.order('id')`) : sans
 * lui, l'ordre des lignes n'est pas garanti d'une page à l'autre, d'où des
 * doublons et des trous.
 */
export async function fetchAllRows<T>(build: (from: number, to: number) => Rows<T>): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}
