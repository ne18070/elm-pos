import { supabase as _supabase } from './client';
import { logAction } from './logger';

const supabase = _supabase as any;

export interface Dossier {
  id:             string;
  business_id:    string;
  reference:      string;
  type_affaire:   string;
  client_name:    string;
  client_phone:   string | null;
  client_email:   string | null;
  adversaire:     string | null;
  tribunal:       string | null;
  juge:           string | null;
  status:         string;
  description:    string | null;
  date_ouverture: string;
  date_audience:  string | null;
  created_at:     string;
  updated_at?:    string;
}

export interface HonoraireLine {
  id:              string;
  business_id:     string;
  dossier_id:      string | null;
  client_name:     string;
  type_prestation: string;
  description:     string | null;
  montant:         number;
  montant_paye:    number;
  status:          string;
  date_facture:    string;
}

export async function getDossiers(businessId: string): Promise<Dossier[]> {
  const { data, error } = await supabase
    .from('dossiers')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createDossier(businessId: string, payload: Partial<Dossier>): Promise<Dossier> {
  const { data, error } = await supabase
    .from('dossiers')
    .insert({ ...payload, business_id: businessId })
    .select()
    .single();
  if (error) throw error;
  await logAction({
    business_id: businessId,
    action: 'dossier.created',
    entity_type: 'dossier',
    entity_id: data.id,
    metadata: { reference: data.reference, client_name: data.client_name }
  });
  return data;
}

export async function updateDossier(businessId: string, id: string, payload: Partial<Dossier>): Promise<Dossier> {
  const { data, error } = await supabase
    .from('dossiers')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  await logAction({
    business_id: businessId,
    action: 'dossier.updated',
    entity_type: 'dossier',
    entity_id: id,
    metadata: { reference: data.reference, client_name: data.client_name }
  });
  return data;
}

export async function updateDossierStatus(businessId: string, id: string, reference: string, status: string): Promise<void> {
  const { error } = await supabase
    .from('dossiers')
    .update({ status })
    .eq('id', id);
  if (error) throw error;
  await logAction({
    business_id: businessId,
    action: status === 'archivé' ? 'dossier.archived' : 'dossier.unarchived',
    entity_type: 'dossier',
    entity_id: id,
    metadata: { reference }
  });
}

export async function getHonorairesByDossier(dossierId: string): Promise<HonoraireLine[]> {
  const { data, error } = await supabase
    .from('honoraires_cabinet')
    .select('*')
    .eq('dossier_id', dossierId)
    .order('date_facture', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createHonoraire(businessId: string, payload: Partial<HonoraireLine>): Promise<HonoraireLine> {
  const { data, error } = await supabase
    .from('honoraires_cabinet')
    .insert({ ...payload, business_id: businessId })
    .select()
    .single();
  if (error) throw error;
  await logAction({
    business_id: businessId,
    action: 'honoraire.added',
    entity_type: 'dossier',
    entity_id: payload.dossier_id!,
    metadata: { montant: payload.montant, type_prestation: payload.type_prestation }
  });
  return data;
}

/**
 * Generates a unique reference for a new dossier.
 * NOTE: For high concurrency, this should be an RPC or DB sequence.
 */
export async function generateDossierReference(businessId: string): Promise<string> {
  const year = new Date().getFullYear();
  const { count, error } = await supabase
    .from('dossiers')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .gte('created_at', `${year}-01-01T00:00:00Z`);
  
  if (error) throw error;
  return `DOS-${year}-${String((count || 0) + 1).padStart(3, '0')}`;
}
