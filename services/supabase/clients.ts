import { supabase } from './client';
import { q } from './q';

// eslint-disable-next-line @typescript-eslint/no-explicit-any

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
    // Filet de sécurité — pas une vraie pagination : utilisé par les
    // sélecteurs client (caisse, contrats, dossiers) et l'export CSV, qui ont
    // besoin de la liste complète. Pour la liste paginée, voir getClientsPage.
    supabase.from('clients').select('*').eq('business_id', businessId).order('name').limit(5000),
  );
  return rows ?? [];
}

/** Page paginée + recherche serveur — utilisée par l'écran de gestion des clients. */
export async function getClientsPage(
  businessId: string,
  options?: { search?: string; limit?: number; offset?: number },
): Promise<{ clients: Client[]; count: number }> {
  const limit  = options?.limit ?? 20;
  const offset = options?.offset ?? 0;

  let query = supabase
    .from('clients')
    .select('*', { count: 'exact' })
    .eq('business_id', businessId)
    .order('name');

  const term = options?.search?.trim().replace(/[,()]/g, ' ');
  if (term) {
    query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%,representative_name.ilike.%${term}%`);
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return { clients: (data ?? []) as Client[], count: count ?? 0 };
}

export async function createClient(businessId: string, form: ClientForm): Promise<Client> {
  return q<Client>(
    supabase.from('clients').insert({ business_id: businessId, ...form }).select().single(),
  );
}

export async function updateClient(id: string, form: Partial<ClientForm>): Promise<Client> {
  return q<Client>(supabase.from('clients').update(form).eq('id', id).select().single());
}

export async function searchClients(businessId: string, query: string): Promise<Client[]> {
  if (!query.trim()) return [];
  const { data } = await supabase
    .from('clients')
    .select('*')
    .eq('business_id', businessId)
    .or(`name.ilike.%${query.trim()}%,phone.ilike.%${query.trim()}%`)
    .order('name')
    .limit(8);
  return data ?? [];
}

export async function deleteClient(id: string): Promise<void> {
  await q(supabase.from('clients').delete().eq('id', id));
}

/**
 * Trouve un client par téléphone (dédup), le crée s'il n'existe pas.
 * Met à jour le nom si différent. Ne lève pas d'erreur — silencieux.
 */
export async function upsertClientByPhone(
  businessId: string,
  name: string,
  phone: string,
): Promise<Client | null> {
  if (!phone.trim()) return null;
  try {
    const normalizedPhone = phone.trim();
    // Cherche d'abord par téléphone exact
    const { data: existing } = await supabase
      .from('clients')
      .select('*')
      .eq('business_id', businessId)
      .eq('phone', normalizedPhone)
      .maybeSingle();

    if (existing) {
      // Met à jour le nom si nécessaire
      if (name.trim() && existing.name !== name.trim()) {
        const { data: updated } = await supabase
          .from('clients')
          .update({ name: name.trim() })
          .eq('id', existing.id)
          .select()
          .single();
        return updated ?? existing;
      }
      return existing;
    }

    // Crée un nouveau client
    const { data: created } = await supabase
      .from('clients')
      .insert({ business_id: businessId, name: name.trim(), phone: normalizedPhone })
      .select()
      .single();
    return created ?? null;
  } catch {
    return null; // silencieux — ne bloque pas la création de l'OT
  }
}
