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

export interface DossierTimeEntry {
  id:               string;
  business_id:      string;
  dossier_id:       string;
  user_id:          string;
  date_record:      string;
  duration_minutes: number;
  hourly_rate:      number;
  total_amount:     number;
  description:      string;
  is_billed:        boolean;
  created_at:       string;
  users?:           { full_name: string };
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

// ─── Time Tracking ────────────────────────────────────────────────────────────

export async function getDossierTimeEntries(dossierId: string): Promise<DossierTimeEntry[]> {
  const { data, error } = await supabase
    .from('dossier_time_entries')
    .select('*, users(full_name)')
    .eq('dossier_id', dossierId)
    .order('date_record', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createDossierTimeEntry(businessId: string, payload: Partial<DossierTimeEntry>): Promise<DossierTimeEntry> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('dossier_time_entries')
    .insert({ ...payload, business_id: businessId, user_id: user.id })
    .select('*, users(full_name)')
    .single();
  
  if (error) throw error;
  return data;
}

export async function deleteDossierTimeEntry(id: string): Promise<void> {
  const { error } = await supabase
    .from('dossier_time_entries')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function billTimeEntries(businessId: string, dossierId: string, entryIds: string[], clientName: string): Promise<void> {
  // 1. Fetch entries to sum amounts and create description
  const { data: entries, error: fetchErr } = await supabase
    .from('dossier_time_entries')
    .select('*')
    .in('id', entryIds)
    .eq('is_billed', false);

  if (fetchErr) throw fetchErr;
  if (!entries || entries.length === 0) throw new Error('No unbilled entries found');

  const totalAmount = entries.reduce((acc: number, e: any) => acc + (Number(e.total_amount) || 0), 0);
  const totalMinutes = entries.reduce((acc: number, e: any) => acc + (e.duration_minutes || 0), 0);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const timeStr = `${hours}h${minutes > 0 ? minutes.toString().padStart(2, '0') : ''}`;

  // 2. Create honoraire line — capture id for rollback
  const { data: honoraire, error: honoraireErr } = await supabase
    .from('honoraires_cabinet')
    .insert({
      business_id:     businessId,
      dossier_id:      dossierId,
      client_name:     clientName,
      type_prestation: 'temps_facture',
      description:     `Facturation temps passé (${timeStr}) — ${entries.length} intervention(s)`,
      montant:         totalAmount,
      montant_paye:    0,
      status:          'impayé',
      date_facture:    new Date().toISOString().slice(0, 10),
    })
    .select('id')
    .single();

  if (honoraireErr) throw honoraireErr;

  // 3. Mark entries as billed — rollback honoraire if this fails (prevents duplicate invoice on retry)
  const { error: updateErr } = await supabase
    .from('dossier_time_entries')
    .update({ is_billed: true, updated_at: new Date().toISOString() })
    .in('id', entryIds);

  if (updateErr) {
    await supabase.from('honoraires_cabinet').delete().eq('id', (honoraire as { id: string }).id);
    throw updateErr;
  }

  await logAction({
    business_id: businessId,
    action: 'honoraire.added',
    entity_type: 'dossier',
    entity_id: dossierId,
    metadata: { source: 'time_tracking', amount: totalAmount }
  });
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
