import { supabase as _supabase } from './client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

export interface Client {
  id: string;
  business_id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  created_at: string;
}

export type ClientForm = Omit<Client, 'id' | 'business_id' | 'created_at'>;

export async function getClients(businessId: string): Promise<Client[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('business_id', businessId)
    .order('name');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createClient(businessId: string, form: ClientForm): Promise<Client> {
  const { data, error } = await supabase
    .from('clients')
    .insert({ business_id: businessId, ...form })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateClient(id: string, form: Partial<ClientForm>): Promise<Client> {
  const { data, error } = await supabase
    .from('clients')
    .update(form)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteClient(id: string): Promise<void> {
  const { error } = await supabase.from('clients').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
