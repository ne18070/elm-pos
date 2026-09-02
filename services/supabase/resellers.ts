import { supabase } from './client';
import { q } from './q';

// Tables ajoutées par migration 021 - pas encore dans database.types.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any

// --- Types --------------------------------------------------------------------

export type ResellerType = 'gros' | 'demi_gros' | 'detaillant';

export interface Reseller {
  id: string;
  business_id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  zone?: string | null;
  notes?: string | null;
  type: ResellerType;
  chef_id?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ResellerClient {
  id: string;
  /** Héritage : revendeur créateur. La table de liaison fait foi désormais. */
  reseller_id?: string | null;
  business_id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  created_at: string;
  /** Nombre de revendeurs auxquels ce client est rattaché (si demandé). */
  link_count?: number;
}

export interface ResellerOffer {
  id: string;
  business_id: string;
  reseller_id: string | null;   // null = tous les revendeurs
  product_id: string;
  product_name?: string;        // jointure
  min_qty: number;
  bonus_qty: number;
  label?: string | null;
  is_active: boolean;
  created_at: string;
}

// --- Revendeurs ---------------------------------------------------------------

export async function getResellers(businessId: string): Promise<Reseller[]> {
  const rows = await q<Reseller[]>(
    supabase.from('resellers').select('*').eq('business_id', businessId).order('name'),
  );
  return rows ?? [];
}

export async function createReseller(
  businessId: string,
  payload: Omit<Reseller, 'id' | 'business_id' | 'created_at'>
): Promise<Reseller> {
  return q<Reseller>(
    supabase.from('resellers').insert({ ...payload, business_id: businessId }).select().single(),
  );
}

export async function updateReseller(
  id: string,
  payload: Partial<Omit<Reseller, 'id' | 'business_id' | 'created_at'>>
): Promise<Reseller> {
  return q<Reseller>(supabase.from('resellers').update(payload).eq('id', id).select().single());
}

export async function deleteReseller(id: string): Promise<void> {
  await q(supabase.from('resellers').delete().eq('id', id));
}

// --- Clients revendeurs -------------------------------------------------------

/** Clients rattachés à un revendeur, via la table de liaison. `link_count` =
 *  nombre total de revendeurs auxquels chaque client est rattaché. */
export async function getResellerClients(resellerId: string): Promise<ResellerClient[]> {
  const links = await q<{ client: ResellerClient | null }[]>(
    supabase
      .from('reseller_client_links')
      .select('client:reseller_clients(*)')
      .eq('reseller_id', resellerId),
  );
  const clients = (links ?? []).map((l) => l.client).filter((c): c is ResellerClient => !!c);
  if (clients.length === 0) return [];

  // Nombre de rattachements par client (partagé vs exclusif à ce revendeur)
  const rows = await q<{ reseller_client_id: string }[]>(
    supabase
      .from('reseller_client_links')
      .select('reseller_client_id')
      .in('reseller_client_id', clients.map((c) => c.id)),
  );
  const counts = new Map<string, number>();
  (rows ?? []).forEach((r) => counts.set(r.reseller_client_id, (counts.get(r.reseller_client_id) ?? 0) + 1));

  return clients
    .map((c) => ({ ...c, link_count: counts.get(c.id) ?? 1 }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Tous les clients revendeurs du commerce (référentiel partagé). */
export async function getBusinessResellerClients(businessId: string): Promise<ResellerClient[]> {
  const rows = await q<ResellerClient[]>(
    supabase.from('reseller_clients').select('*').eq('business_id', businessId).order('name'),
  );
  return rows ?? [];
}

export async function createResellerClient(
  resellerId: string,
  businessId: string,
  payload: Omit<ResellerClient, 'id' | 'reseller_id' | 'business_id' | 'created_at' | 'link_count'>
): Promise<ResellerClient> {
  const client = await q<ResellerClient>(
    supabase
      .from('reseller_clients')
      .insert({ ...payload, reseller_id: resellerId, business_id: businessId })
      .select()
      .single(),
  );
  await linkResellerClient(businessId, resellerId, client.id);
  return client;
}

/** Rattache un client existant à un revendeur (no-op si déjà rattaché). */
export async function linkResellerClient(
  businessId: string,
  resellerId: string,
  clientId: string,
): Promise<void> {
  await q(
    supabase
      .from('reseller_client_links')
      .upsert(
        { business_id: businessId, reseller_id: resellerId, reseller_client_id: clientId },
        { onConflict: 'reseller_id,reseller_client_id', ignoreDuplicates: true },
      ),
  );
}

/** Détache un client d'un revendeur (le client reste dans le référentiel). */
export async function unlinkResellerClient(resellerId: string, clientId: string): Promise<void> {
  await q(
    supabase
      .from('reseller_client_links')
      .delete()
      .eq('reseller_id', resellerId)
      .eq('reseller_client_id', clientId),
  );
}

export async function updateResellerClient(
  id: string,
  payload: Partial<Pick<ResellerClient, 'name' | 'phone' | 'address'>>
): Promise<ResellerClient> {
  return q<ResellerClient>(
    supabase.from('reseller_clients').update(payload).eq('id', id).select().single(),
  );
}

export async function deleteResellerClient(id: string): Promise<void> {
  await q(supabase.from('reseller_clients').delete().eq('id', id));
}

// --- Offres volume ------------------------------------------------------------

export async function getResellerOffers(businessId: string): Promise<ResellerOffer[]> {
  const data = await q<(ResellerOffer & { products?: { name: string } })[]>(
    supabase
      .from('reseller_offers')
      .select('*, products(name)')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false }),
  );
  return (data ?? []).map((row) => ({ ...row, product_name: row.products?.name }));
}

export async function createResellerOffer(
  businessId: string,
  payload: Omit<ResellerOffer, 'id' | 'business_id' | 'product_name' | 'created_at'>
): Promise<ResellerOffer> {
  return q<ResellerOffer>(
    supabase
      .from('reseller_offers')
      .insert({ ...payload, business_id: businessId })
      .select()
      .single(),
  );
}

export async function updateResellerOffer(
  id: string,
  payload: Partial<Pick<ResellerOffer, 'min_qty' | 'bonus_qty' | 'label' | 'is_active' | 'reseller_id'>>
): Promise<ResellerOffer> {
  return q<ResellerOffer>(
    supabase.from('reseller_offers').update(payload).eq('id', id).select().single(),
  );
}

export async function deleteResellerOffer(id: string): Promise<void> {
  await q(supabase.from('reseller_offers').delete().eq('id', id));
}

/**
 * Retourne les offres volume actives pour un revendeur donné
 * (ses offres spécifiques + les offres globales pour tous)
 */
export async function getActiveOffersForReseller(
  businessId: string,
  resellerId: string
): Promise<ResellerOffer[]> {
  const data = await q<(ResellerOffer & { products?: { name: string } })[]>(
    supabase
      .from('reseller_offers')
      .select('*, products(name)')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .or(`reseller_id.eq.${resellerId},reseller_id.is.null`),
  );
  return (data ?? []).map((row) => ({ ...row, product_name: row.products?.name }));
}
