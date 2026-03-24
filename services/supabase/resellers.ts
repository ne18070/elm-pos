import { supabase } from './client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Reseller {
  id: string;
  business_id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ResellerClient {
  id: string;
  reseller_id: string;
  business_id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  created_at: string;
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

// ─── Revendeurs ───────────────────────────────────────────────────────────────

export async function getResellers(businessId: string): Promise<Reseller[]> {
  const { data, error } = await supabase
    .from('resellers')
    .select('*')
    .eq('business_id', businessId)
    .order('name');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createReseller(
  businessId: string,
  payload: Omit<Reseller, 'id' | 'business_id' | 'created_at'>
): Promise<Reseller> {
  const { data, error } = await supabase
    .from('resellers')
    .insert({ ...payload, business_id: businessId })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateReseller(
  id: string,
  payload: Partial<Omit<Reseller, 'id' | 'business_id' | 'created_at'>>
): Promise<Reseller> {
  const { data, error } = await supabase
    .from('resellers')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteReseller(id: string): Promise<void> {
  const { error } = await supabase.from('resellers').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Clients revendeurs ───────────────────────────────────────────────────────

export async function getResellerClients(resellerId: string): Promise<ResellerClient[]> {
  const { data, error } = await supabase
    .from('reseller_clients')
    .select('*')
    .eq('reseller_id', resellerId)
    .order('name');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createResellerClient(
  resellerId: string,
  businessId: string,
  payload: Omit<ResellerClient, 'id' | 'reseller_id' | 'business_id' | 'created_at'>
): Promise<ResellerClient> {
  const { data, error } = await supabase
    .from('reseller_clients')
    .insert({ ...payload, reseller_id: resellerId, business_id: businessId })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateResellerClient(
  id: string,
  payload: Partial<Pick<ResellerClient, 'name' | 'phone' | 'address'>>
): Promise<ResellerClient> {
  const { data, error } = await supabase
    .from('reseller_clients')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteResellerClient(id: string): Promise<void> {
  const { error } = await supabase.from('reseller_clients').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Offres volume ────────────────────────────────────────────────────────────

export async function getResellerOffers(businessId: string): Promise<ResellerOffer[]> {
  const { data, error } = await supabase
    .from('reseller_offers')
    .select('*, products(name)')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: ResellerOffer & { products?: { name: string } }) => ({
    ...row,
    product_name: row.products?.name,
  }));
}

export async function createResellerOffer(
  businessId: string,
  payload: Omit<ResellerOffer, 'id' | 'business_id' | 'product_name' | 'created_at'>
): Promise<ResellerOffer> {
  const { data, error } = await supabase
    .from('reseller_offers')
    .insert({ ...payload, business_id: businessId })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateResellerOffer(
  id: string,
  payload: Partial<Pick<ResellerOffer, 'min_qty' | 'bonus_qty' | 'label' | 'is_active' | 'reseller_id'>>
): Promise<ResellerOffer> {
  const { data, error } = await supabase
    .from('reseller_offers')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteResellerOffer(id: string): Promise<void> {
  const { error } = await supabase.from('reseller_offers').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Retourne les offres volume actives pour un revendeur donné
 * (ses offres spécifiques + les offres globales pour tous)
 */
export async function getActiveOffersForReseller(
  businessId: string,
  resellerId: string
): Promise<ResellerOffer[]> {
  const { data, error } = await supabase
    .from('reseller_offers')
    .select('*, products(name)')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .or(`reseller_id.eq.${resellerId},reseller_id.is.null`);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: ResellerOffer & { products?: { name: string } }) => ({
    ...row,
    product_name: row.products?.name,
  }));
}
