import { supabase as supabaseRaw } from '../../renderer/lib/supabase';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = supabaseRaw as any;

export interface RefItem {
  id:         string;
  value:      string;
  label:      string;
  color:      string | null;
  metadata:   Record<string, unknown>;
  sort_order: number;
  is_active:  boolean;
  business_id: string | null;
}

/**
 * Retourne les items actifs d'une catégorie.
 * Priorité : données du business (si business_id fourni) fusionnées avec les globales.
 * Un item business avec le même value écrase l'item global.
 */
export async function getReferenceData(
  category:   string,
  businessId?: string,
): Promise<RefItem[]> {
  let query = supabase
    .from('reference_data')
    .select('*')
    .eq('category', category)
    .eq('is_active', true)
    .order('sort_order');

  if (businessId) {
    query = query.or(`business_id.is.null,business_id.eq.${businessId}`);
  } else {
    query = query.is('business_id', null);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  // Fusion : business écrase global si même value
  const map = new Map<string, RefItem>();
  for (const row of (data ?? [])) {
    const existing = map.get(row.value);
    // Préférer les données business (business_id non null) sur les globales
    if (!existing || (existing.business_id === null && row.business_id !== null)) {
      map.set(row.value, row as RefItem);
    }
  }

  return Array.from(map.values()).sort((a, b) => a.sort_order - b.sort_order);
}

/** Upsert un item (business_id requis pour données locales, null pour globales) */
export async function upsertRefItem(
  category:   string,
  item:       Omit<RefItem, 'id'>,
): Promise<void> {
  const { error } = await supabase
    .from('reference_data')
    .upsert({ ...item, category }, { onConflict: 'business_id,category,value' });
  if (error) throw new Error(error.message);
}

/** Supprime un item */
export async function deleteRefItem(id: string): Promise<void> {
  const { error } = await supabase.from('reference_data').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Toggle is_active d'un item */
export async function toggleRefItem(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from('reference_data')
    .update({ is_active: isActive })
    .eq('id', id);
  if (error) throw new Error(error.message);
}
