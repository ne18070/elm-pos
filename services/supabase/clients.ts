import { supabase as _supabase } from './client';
import { q } from './q';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

export interface Client {
  id: string;
  business_id: string;
  name: string;
  type?: string | null; // ex: personne_morale, association
  identification_number?: string | null; // RCCM, NINEA, CNI
  representative_name?: string | null; // Pour les personnes morales
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  created_at: string;
}

export type ClientForm = Omit<Client, 'id' | 'business_id' | 'created_at'>;

export async function getClients(businessId: string): Promise<Client[]> {
  const rows = await q<Client[]>(
    supabase.from('clients').select('*').eq('business_id', businessId).order('name'),
  );
  return rows ?? [];
}

export async function createClient(businessId: string, form: ClientForm): Promise<Client> {
  return q<Client>(
    supabase.from('clients').insert({ business_id: businessId, ...form }).select().single(),
  );
}

export async function updateClient(id: string, form: Partial<ClientForm>): Promise<Client> {
  return q<Client>(supabase.from('clients').update(form).eq('id', id).select().single());
}

export async function deleteClient(id: string): Promise<void> {
  await q(supabase.from('clients').delete().eq('id', id));
}
