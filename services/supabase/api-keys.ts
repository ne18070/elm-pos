import { supabase } from './client';
// eslint-disable-next-line @typescript-eslint/no-explicit-any

export interface ApiKey {
  id: string;
  business_id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
  created_by: string | null;
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function getApiKeys(businessId: string): Promise<ApiKey[]> {
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, business_id, name, key_prefix, scopes, is_active, last_used_at, created_at, created_by')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ApiKey[];
}

/** Generates and stores an API key. Returns the raw key — shown only once. */
export async function createApiKey(
  businessId: string,
  name: string,
  scopes: string[],
  userId: string,
): Promise<{ raw: string; key: ApiKey }> {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  const raw = `elm_live_${hex}`;
  const prefix = raw.slice(0, 17);
  const hash = await sha256(raw);

  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      business_id: businessId,
      name,
      key_prefix: prefix,
      key_hash: hash,
      scopes,
      is_active: true,
      created_by: userId,
    })
    .select('id, business_id, name, key_prefix, scopes, is_active, last_used_at, created_at, created_by')
    .single();

  if (error) throw new Error(error.message);
  return { raw, key: data as ApiKey };
}

export async function revokeApiKey(id: string): Promise<void> {
  const { error } = await supabase.from('api_keys').update({ is_active: false }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function reactivateApiKey(id: string): Promise<void> {
  const { error } = await supabase.from('api_keys').update({ is_active: true }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteApiKey(id: string): Promise<void> {
  const { error } = await supabase.from('api_keys').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
