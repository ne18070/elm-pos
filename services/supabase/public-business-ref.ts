import { supabase as _supabase } from './client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

export function slugifyBusinessName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildPublicBusinessRef(name: string, publicSlug?: string | null): string {
  return publicSlug || slugifyBusinessName(name) || 'business';
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeRef(value: string): string {
  return decodeURIComponent(value).trim().replace(/^\/+|\/+$/g, '');
}

export async function findPublicBusinessByRef<T extends { name: string }>(
  businessRef: string,
  select: string,
): Promise<T | null> {
  const ref = normalizeRef(businessRef);

  if (isUuid(ref)) {
    const { data, error } = await supabase
      .from('businesses')
      .select(select)
      .eq('id', ref)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return (data as T | null) ?? null;
  }

  {
    const { data, error } = await supabase
      .from('businesses')
      .select(select)
      .eq('public_slug', ref)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (data) return data as T;
  }

  const guess = ref.replace(/-/g, ' ');
  const { data, error } = await supabase
    .from('businesses')
    .select(select)
    .ilike('name', `%${guess}%`);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as T[];
  return rows.find((row) => slugifyBusinessName(row.name) === ref) ?? null;
}
