import { supabase as supabaseRaw } from '../../renderer/lib/supabase';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = supabaseRaw as any;

export interface BusinessTypeRow {
  id:           string;
  label:        string;
  description:  string | null;
  icon:         string;
  accent_color: string;
  is_active:    boolean;
  sort_order:   number;
}

export interface AppModule {
  id:          string;
  label:       string;
  description: string | null;
  icon:        string;
  is_core:     boolean;
  is_active:   boolean;
  sort_order:  number;
}

export interface TypeModule {
  business_type_id: string;
  module_id:        string;
  is_default:       boolean;
}

export interface BusinessTypeWithModules extends BusinessTypeRow {
  modules: { module_id: string; is_default: boolean }[];
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

/** Côté client / configure : seulement les types actifs */
export async function getBusinessTypes(): Promise<BusinessTypeRow[]> {
  const { data, error } = await supabase
    .from('business_types')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Backoffice admin : tous les types (actifs et inactifs) */
export async function getAllBusinessTypes(): Promise<BusinessTypeRow[]> {
  const { data, error } = await supabase
    .from('business_types')
    .select('*')
    .order('sort_order');
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Côté client : seulement les modules actifs */
export async function getAppModules(): Promise<AppModule[]> {
  const { data, error } = await supabase
    .from('app_modules')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Backoffice admin : tous les modules */
export async function getAllAppModules(): Promise<AppModule[]> {
  const { data, error } = await supabase
    .from('app_modules')
    .select('*')
    .order('sort_order');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getTypeModules(): Promise<TypeModule[]> {
  const { data, error } = await supabase
    .from('business_type_modules')
    .select('*');
  if (error) throw new Error(error.message);
  return data ?? [];
}

// Fetch types enrichis avec leurs modules
export async function getBusinessTypesWithModules(): Promise<BusinessTypeWithModules[]> {
  const [types, links] = await Promise.all([getBusinessTypes(), getTypeModules()]);
  return types.map((t) => ({
    ...t,
    modules: links.filter((l) => l.business_type_id === t.id).map((l) => ({
      module_id:  l.module_id,
      is_default: l.is_default,
    })),
  }));
}

// ─── Upsert ───────────────────────────────────────────────────────────────────

export async function upsertBusinessType(data: Omit<BusinessTypeRow, 'created_at'>): Promise<void> {
  const { error } = await supabase.from('business_types').upsert(data, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

export async function upsertAppModule(data: Omit<AppModule, 'created_at'>): Promise<void> {
  const { error } = await supabase.from('app_modules').upsert(data, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

export async function setTypeModules(
  typeId: string,
  modules: { module_id: string; is_default: boolean }[]
): Promise<void> {
  // Delete existing then re-insert
  const { error: del } = await supabase
    .from('business_type_modules')
    .delete()
    .eq('business_type_id', typeId);
  if (del) throw new Error(del.message);

  if (modules.length === 0) return;
  const { error: ins } = await supabase.from('business_type_modules').insert(
    modules.map((m: any) => ({ business_type_id: typeId, module_id: m.module_id, is_default: m.is_default }))
  );
  if (ins) throw new Error(ins.message);
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteBusinessType(id: string): Promise<void> {
  const { error } = await supabase.from('business_types').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteAppModule(id: string): Promise<void> {
  const { error } = await supabase.from('app_modules').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
