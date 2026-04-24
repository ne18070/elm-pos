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
  v: Omit<Voiture, 'id' | 'business_id' | 'created_at' | 'updated_at'>,
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
  v: Partial<Omit<Voiture, 'id' | 'business_id' | 'created_at' | 'updated_at'>>,
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
