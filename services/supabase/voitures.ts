import { supabase as _supabase } from './client';
import { findPublicBusinessByRef } from './public-business-ref';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

// ─── Types ────────────────────────────────────────────────────────────────────

export type VoitureStatut = 'disponible' | 'reserve' | 'vendu';
export type Carburant      = 'essence' | 'diesel' | 'hybride' | 'electrique';
export type Transmission   = 'manuelle' | 'automatique';
export type LeadStatut     = 'nouveau' | 'contacte' | 'converti';

export interface Voiture {
  id:               string;
  business_id:      string;
  marque:           string;
  modele:           string;
  annee:            number | null;
  prix:             number;
  kilometrage:      number | null;
  carburant:        Carburant | null;
  transmission:     Transmission | null;
  couleur:          string | null;
  description:      string | null;
  image_principale: string | null;
  statut:           VoitureStatut;
  owner_type:        'owned' | 'third_party';
  owner_name:        string | null;
  owner_phone:       string | null;
  commission_type:   'percent' | 'fixed';
  commission_value:  number;
  owner_report_token:string | null;
  created_at:       string;
  updated_at:       string;
}

export interface VoitureLead {
  id:          string;
  business_id: string;
  voiture_id:  string | null;
  nom:         string;
  telephone:   string;
  message:     string | null;
  statut:      LeadStatut;
  created_at:  string;
  voitures?:   Voiture | null;
}

export interface PublicAgencyInfo {
  id:       string;
  name:     string;
  logo_url: string | null;
  currency: string;
  phone:    string | null;
  address:  string | null;
}

export const CARBURANT_LABELS: Record<Carburant, string> = {
  essence:    'Essence',
  diesel:     'Diesel',
  hybride:    'Hybride',
  electrique: 'Électrique',
};

export const TRANSMISSION_LABELS: Record<Transmission, string> = {
  manuelle:    'Manuelle',
  automatique: 'Automatique',
};

export const STATUT_CFG: Record<VoitureStatut, { label: string; color: string }> = {
  disponible: { label: 'Disponible', color: 'bg-badge-success text-status-success' },
  reserve:    { label: 'Réservé',    color: 'bg-badge-warning text-status-warning' },
  vendu:      { label: 'Vendu',      color: 'bg-badge-error   text-status-error'   },
};

export const LEAD_STATUT_CFG: Record<LeadStatut, { label: string; color: string }> = {
  nouveau:   { label: 'Nouveau',   color: 'bg-badge-info    text-status-info'    },
  contacte:  { label: 'Contacté',  color: 'bg-badge-warning text-status-warning' },
  converti:  { label: 'Converti',  color: 'bg-badge-success text-status-success' },
};

// ─── Dashboard — Voitures ─────────────────────────────────────────────────────

export async function getVoitures(businessId: string): Promise<Voiture[]> {
  const { data, error } = await supabase
    .from('voitures')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createVoiture(
  businessId: string,
  v: Omit<Voiture, 'id' | 'business_id' | 'created_at' | 'updated_at' | 'owner_report_token'>,
): Promise<Voiture> {
  const { data, error } = await supabase
    .from('voitures')
    .insert({ ...v, business_id: businessId })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateVoiture(
  id: string,
  v: Partial<Omit<Voiture, 'id' | 'business_id' | 'created_at' | 'updated_at' | 'owner_report_token'>>,
): Promise<void> {
  const { error } = await supabase
    .from('voitures')
    .update({ ...v, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteVoiture(id: string): Promise<void> {
  const { error } = await supabase.from('voitures').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function uploadVoitureImage(businessId: string, file: File): Promise<string> {
  const ext  = file.name.split('.').pop() ?? 'jpg';
  const path = `voitures/${businessId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from('voitures')
    .upload(path, file, { upsert: true });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from('voitures').getPublicUrl(path);
  return data.publicUrl;
}

// ─── Dashboard — Leads ───────────────────────────────────────────────────────

export async function getLeads(businessId: string): Promise<VoitureLead[]> {
  const { data, error } = await supabase
    .from('voiture_leads')
    .select('*, voitures(marque, modele, annee, image_principale)')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function updateLeadStatut(id: string, statut: LeadStatut): Promise<void> {
  const { error } = await supabase
    .from('voiture_leads')
    .update({ statut })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteLead(id: string): Promise<void> {
  const { error } = await supabase.from('voiture_leads').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Public ───────────────────────────────────────────────────────────────────

export async function getPublicAgencyInfo(
  businessRef: string,
): Promise<PublicAgencyInfo | null> {
  return findPublicBusinessByRef<PublicAgencyInfo>(
    businessRef,
    'id, name, logo_url, currency, phone, address',
  );
}

export async function getPublicVoitures(businessId: string): Promise<Voiture[]> {
  const { data, error } = await supabase
    .from('voitures')
    .select('*')
    .eq('business_id', businessId)
    .neq('statut', 'vendu')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createLead(
  businessId: string,
  lead: { voiture_id?: string; nom: string; telephone: string; message?: string },
): Promise<void> {
  const { error } = await supabase
    .from('voiture_leads')
    .insert({ ...lead, business_id: businessId, statut: 'nouveau' });
  if (error) throw new Error(error.message);
}

// ─── Comptabilité — écriture de vente ────────────────────────────────────────

export async function recordVoitureVente(
  businessId: string,
  voiture: Pick<Voiture, 'id' | 'marque' | 'modele' | 'annee' | 'prix'> & Partial<Pick<Voiture, 'owner_type' | 'owner_name' | 'commission_type' | 'commission_value'>>,
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const label = `${voiture.marque} ${voiture.modele}${voiture.annee ? ` (${voiture.annee})` : ''}`;
  const commission = voiture.owner_type === 'third_party'
    ? computeVehicleCommission(voiture.prix, voiture.commission_type, voiture.commission_value)
    : voiture.prix;
  const ownerShare = voiture.owner_type === 'third_party'
    ? Math.max(0, voiture.prix - commission)
    : 0;

  const { data: entry, error: entryErr } = await supabase
    .from('journal_entries')
    .insert({
      business_id: businessId,
      entry_date:  today,
      reference:   `VOI-${voiture.id.slice(0, 8).toUpperCase()}`,
      description: `Vente véhicule : ${label}`,
      source:      'voiture',
      source_id:   voiture.id,
    })
    .select('id')
    .single();
  if (entryErr) throw new Error(entryErr.message);

  const lines = buildVoitureSaleLines(entry.id, voiture, commission, ownerShare);
  const { error: linesErr } = await supabase.from('journal_lines').insert(lines);
  if (linesErr) throw new Error(linesErr.message);
}

function buildVoitureSaleLines(
  entryId: string,
  voiture: Pick<Voiture, 'prix'> & Partial<Pick<Voiture, 'owner_type' | 'owner_name'>>,
  commission: number,
  ownerShare: number,
): { entry_id: string; account_code: string; account_name: string; debit: number; credit: number }[] {
  const lines: { entry_id: string; account_code: string; account_name: string; debit: number; credit: number }[] = [
    { entry_id: entryId, account_code: '411', account_name: 'Clients', debit: voiture.prix, credit: 0 },
  ];
  if (ownerShare > 0.01) {
    lines.push({
      entry_id: entryId,
      account_code: '467',
      account_name: `Propriétaire véhicule - ${voiture.owner_name ?? 'tiers'}`,
      debit: 0,
      credit: ownerShare,
    });
  }
  lines.push({
    entry_id: entryId,
    account_code: '701',
    account_name: voiture.owner_type === 'third_party' ? 'Commission vente de véhicules' : 'Ventes de véhicules',
    debit: 0,
    credit: commission,
  });
  return lines;
}

function computeVehicleCommission(total: number, type: 'percent' | 'fixed' | null | undefined, value: number | null | undefined): number {
  const raw = type === 'fixed' ? Number(value ?? 0) : total * (Number(value ?? 0) / 100);
  return Math.min(total, Math.max(0, raw));
}

/*
    { entry_id: entry.id, account_code: '411', account_name: 'Clients',              debit: voiture.prix, credit: 0 },
    { entry_id: entry.id, account_code: '701', account_name: 'Ventes de véhicules',  debit: 0, credit: voiture.prix },
  ]);
  if (linesErr) throw new Error(linesErr.message);
}
*/
