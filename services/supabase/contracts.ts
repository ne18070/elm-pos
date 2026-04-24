import { supabase as _supabase } from './client';

// Tables nouvelles - pas encore dans database.types.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

// --- Types --------------------------------------------------------------------

export type ContractStatus = 'draft' | 'sent' | 'signed' | 'archived';

export interface RentalVehicle {
  id:             string;
  business_id:    string;
  name:           string;
  brand:          string | null;
  model:          string | null;
  year:           number | null;
  license_plate:  string | null;
  color:          string | null;
  price_per_day:  number;
  price_per_hour: number | null;
  deposit_amount: number;
  currency:       string;
  description:    string | null;
  image_url:      string | null;
  is_available:   boolean;
  created_at:     string;
}

export interface ContractTemplate {
  id:          string;
  business_id: string;
  name:        string;
  body:        string;
  created_at:  string;
  updated_at:  string;
}

export interface Contract {
  id:               string;
  business_id:      string;
  vehicle_id:       string | null;
  template_id:      string | null;
  client_name:      string;
  client_phone:     string | null;
  client_email:     string | null;
  client_id_number: string | null;
  client_address:   string | null;
  start_date:       string;
  end_date:         string;
  pickup_location:  string | null;
  return_location:  string | null;
  price_per_day:    number | null;
  deposit_amount:   number | null;
  total_amount:     number | null;
  currency:         string;
  body:             string;
  token:            string;
  token_expires_at: string;
  status:           ContractStatus;
  signed_at:        string | null;
  signature_image:  string | null;
  pdf_url:                  string | null;
  lessor_signature_image:   string | null;
  notes:                    string | null;
  created_by:       string | null;
  created_at:       string;
  updated_at:       string;
  // paiement
  amount_paid:      number | null;
  payment_date:     string | null;
  payment_method:   'cash' | 'card' | 'transfer' | 'mobile_money' | null;
  // join
  rental_vehicles?: RentalVehicle | null;
}

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'mobile_money';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash:         'Espèces',
  card:         'Carte bancaire',
  transfer:     'Virement',
  mobile_money: 'Mobile Money',
};

export interface RecordPaymentInput {
  amount_paid:    number;
  payment_date:   string;
  payment_method: PaymentMethod;
}

// --- Helpers ------------------------------------------------------------------

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Remplace {{variable}} dans le body avec les valeurs du formulaire */
export function fillTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

// --- Véhicules ----------------------------------------------------------------

export async function getVehicles(businessId: string): Promise<RentalVehicle[]> {
  const { data, error } = await supabase
    .from('rental_vehicles')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createVehicle(
  businessId: string,
  v: Omit<RentalVehicle, 'id' | 'business_id' | 'created_at'>
): Promise<RentalVehicle> {
  const { data, error } = await supabase
    .from('rental_vehicles')
    .insert({ ...v, business_id: businessId })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateVehicle(
  id: string,
  v: Partial<Omit<RentalVehicle, 'id' | 'business_id' | 'created_at'>>
): Promise<void> {
  const { error } = await supabase
    .from('rental_vehicles')
    .update(v)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteVehicle(id: string): Promise<void> {
  const { error } = await supabase
    .from('rental_vehicles')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function toggleVehicleAvailability(id: string, is_available: boolean): Promise<void> {
  const { error } = await supabase
    .from('rental_vehicles')
    .update({ is_available })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// --- Modèles de contrat -------------------------------------------------------

export async function getTemplates(businessId: string): Promise<ContractTemplate[]> {
  const { data, error } = await supabase
    .from('contract_templates')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createTemplate(
  businessId: string,
  name: string,
  body: string
): Promise<ContractTemplate> {
  const { data, error } = await supabase
    .from('contract_templates')
    .insert({ business_id: businessId, name, body })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateTemplate(id: string, name: string, body: string): Promise<void> {
  const { error } = await supabase
    .from('contract_templates')
    .update({ name, body })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase
    .from('contract_templates')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// --- Contrats -----------------------------------------------------------------

export async function getContracts(businessId: string): Promise<Contract[]> {
  const { data, error } = await supabase
    .from('contracts')
    .select('*, rental_vehicles(name, license_plate)')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export interface CreateContractInput {
  vehicle_id:       string | null;
  template_id:      string | null;
  client_name:      string;
  client_phone:     string;
  client_email:     string;
  client_id_number: string;
  client_address:   string;
  start_date:       string;
  end_date:         string;
  pickup_location:  string;
  return_location:  string;
  price_per_day:    number;
  deposit_amount:   number;
  total_amount:     number;
  currency:         string;
  body:             string;
  notes:            string;
}

export async function createContract(
  businessId: string,
  userId: string,
  input: CreateContractInput
): Promise<Contract> {
  const token = generateToken();
  const expires = new Date();
  expires.setDate(expires.getDate() + 7);

  const { data, error } = await supabase
    .from('contracts')
    .insert({
      ...input,
      business_id: businessId,
      created_by: userId,
      token,
      token_expires_at: expires.toISOString(),
      status: 'draft',
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateContract(
  id: string,
  input: CreateContractInput,
  invalidate: boolean,
): Promise<Contract> {
  const patch: Record<string, unknown> = {
    vehicle_id:       input.vehicle_id,
    template_id:      input.template_id,
    client_name:      input.client_name,
    client_phone:     input.client_phone   || null,
    client_email:     input.client_email   || null,
    client_id_number: input.client_id_number || null,
    client_address:   input.client_address || null,
    start_date:       input.start_date,
    end_date:         input.end_date,
    pickup_location:  input.pickup_location || null,
    return_location:  input.return_location || null,
    price_per_day:    input.price_per_day,
    deposit_amount:   input.deposit_amount,
    total_amount:     input.total_amount,
    currency:         input.currency,
    body:             input.body,
    notes:            input.notes || null,
  };

  if (invalidate) {
    const token   = generateToken();
    const expires = new Date();
    expires.setDate(expires.getDate() + 7);
    Object.assign(patch, {
      status:                 'draft',
      token,
      token_expires_at:       expires.toISOString(),
      signed_at:              null,
      signature_image:        null,
      lessor_signature_image: null,
      pdf_url:                null,
    });
  }

  const { data, error } = await supabase
    .from('contracts')
    .update(patch)
    .eq('id', id)
    .select('*, rental_vehicles(name, license_plate, brand, model)')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function sendContract(id: string): Promise<void> {
  // Renouvelle le token pour 7 jours
  const expires = new Date();
  expires.setDate(expires.getDate() + 7);
  const token = generateToken();

  const { data, error } = await supabase
    .from('contracts')
    .update({ status: 'sent', token, token_expires_at: expires.toISOString() })
    .eq('id', id)
    .select('vehicle_id')
    .single();
  if (error) throw new Error(error.message);

  // Marquer le véhicule comme indisponible
  if (data?.vehicle_id) {
    await supabase
      .from('rental_vehicles')
      .update({ is_available: false })
      .eq('id', data.vehicle_id);
  }
}

export async function archiveContract(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('contracts')
    .update({ status: 'archived' })
    .eq('id', id)
    .select('vehicle_id')
    .single();
  if (error) throw new Error(error.message);

  // Remettre le véhicule disponible si aucun contrat actif ne l'utilise
  if (data?.vehicle_id) {
    const { count } = await supabase
      .from('contracts')
      .select('id', { count: 'exact', head: true })
      .eq('vehicle_id', data.vehicle_id)
      .in('status', ['sent', 'signed']);

    if ((count ?? 0) === 0) {
      await supabase
        .from('rental_vehicles')
        .update({ is_available: true })
        .eq('id', data.vehicle_id);
    }
  }
}

export async function updateContractPdf(id: string, pdf_url: string): Promise<void> {
  const { error } = await supabase
    .from('contracts')
    .update({ pdf_url })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// --- Page publique (sans auth) ------------------------------------------------

export async function getContractByToken(token: string): Promise<Contract | null> {
  const { data, error } = await supabase
    .from('contracts')
    .select('*, rental_vehicles(name, license_plate, brand, model)')
    .eq('token', token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function signContract(
  token: string,
  signatureDataUrl: string
): Promise<{ pdf_url: string | null }> {
  // 1. Upload de la signature
  const blob = dataUrlToBlob(signatureDataUrl);
  const path = `signatures/${token}.png`;

  const { error: upErr } = await supabase.storage
    .from('contracts')
    .upload(path, blob, { contentType: 'image/png', upsert: true });
  if (upErr) throw new Error(upErr.message);

  const { data: urlData } = supabase.storage
    .from('contracts')
    .getPublicUrl(path);
  const signatureUrl = urlData.publicUrl;

  // 2. Mise à jour du contrat
  const { error } = await supabase
    .from('contracts')
    .update({
      status: 'signed',
      signed_at: new Date().toISOString(),
      signature_image: signatureUrl,
    })
    .eq('token', token)
    .eq('status', 'sent');
  if (error) throw new Error(error.message);

  return { pdf_url: null };
}

export async function savePdfUrl(token: string, pdf_url: string): Promise<void> {
  const { error } = await supabase
    .from('contracts')
    .update({ pdf_url })
    .eq('token', token);
  if (error) throw new Error(error.message);
}

// --- Signature loueur ---------------------------------------------------------

export async function uploadLessorSignature(contractId: string, blob: Blob): Promise<string> {
  const path = `lessor-signatures/${contractId}.png`;
  const { error } = await supabase.storage
    .from('contracts')
    .upload(path, blob, { contentType: 'image/png', upsert: true });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from('contracts').getPublicUrl(path);
  return data.publicUrl;
}

export async function saveLessorSignature(contractId: string, imageUrl: string): Promise<void> {
  const { error } = await supabase
    .from('contracts')
    .update({ lessor_signature_image: imageUrl })
    .eq('id', contractId);
  if (error) throw new Error(error.message);
}

// --- Upload image véhicule ----------------------------------------------------

export async function uploadVehicleImage(businessId: string, file: File): Promise<string> {
  const ext  = file.name.split('.').pop() ?? 'jpg';
  const path = `vehicles/${businessId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from('contracts')
    .upload(path, file, { upsert: true });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from('contracts').getPublicUrl(path);
  return data.publicUrl;
}

// --- Upload PDF ---------------------------------------------------------------

export async function uploadContractPdf(token: string, blob: Blob): Promise<string> {
  const path = `pdfs/${token}.pdf`;
  const { error } = await supabase.storage
    .from('contracts')
    .upload(path, blob, { contentType: 'application/pdf', upsert: true });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from('contracts').getPublicUrl(path);
  return data.publicUrl;
}

// --- Utils --------------------------------------------------------------------

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/png';
  const bin  = atob(b64);
  const arr  = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export function buildWhatsAppLink(phone: string, contractUrl: string, clientName: string): string {
  const clean = phone.replace(/\D/g, '');
  const msg = encodeURIComponent(
    `Bonjour ${clientName},\n\nVeuillez trouver ci-dessous le lien pour signer votre contrat de location :\n${contractUrl}\n\nCe lien est valable 7 jours.`
  );
  return `https://wa.me/${clean}?text=${msg}`;
}

export function daysCount(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  return Math.max(1, Math.ceil((e.getTime() - s.getTime()) / 86400000));
}

// --- Paiement location + écriture comptable -----------------------------------

export async function recordPayment(
  contractId: string,
  businessId: string,
  input: RecordPaymentInput,
  contract: { client_name: string; total_amount: number | null },
): Promise<void> {
  // 1. Mettre à jour le contrat
  const { error: updateErr } = await supabase
    .from('contracts')
    .update({
      amount_paid:    input.amount_paid,
      payment_date:   input.payment_date,
      payment_method: input.payment_method,
    })
    .eq('id', contractId);
  if (updateErr) throw new Error(updateErr.message);

  // 2. Supprimer l'écriture comptable existante pour ce contrat (mise à jour)
  await (supabase as any)
    .from('journal_entries')
    .delete()
    .eq('business_id', businessId)
    .eq('source', 'rental')
    .eq('source_id', contractId);

  // 3. Créer la nouvelle écriture comptable
  const total       = contract.total_amount ?? 0;
  const paid        = input.amount_paid;
  const outstanding = Math.max(0, total - paid);

  const debitAccount = input.payment_method === 'card'
    ? { code: '521', name: 'Banque / Carte' }
    : { code: '571', name: input.payment_method === 'mobile_money' ? 'Caisse / Mobile' : 'Caisse' };

  const lines: { account_code: string; account_name: string; debit: number; credit: number }[] = [];
  if (paid > 0)           lines.push({ account_code: debitAccount.code, account_name: debitAccount.name, debit: paid,        credit: 0 });
  if (outstanding > 0.01) lines.push({ account_code: '411',            account_name: 'Clients',          debit: outstanding, credit: 0 });
  lines.push(              { account_code: '706',            account_name: 'Location de véhicule',debit: 0,           credit: total });

  const { data: entry, error: entryErr } = await (supabase as any)
    .from('journal_entries')
    .insert({
      business_id: businessId,
      entry_date:  input.payment_date,
      description: `Location - ${contract.client_name}`,
      source:      'rental',
      source_id:   contractId,
    })
    .select()
    .single();
  if (entryErr) throw new Error(entryErr.message);

  const { error: linesErr } = await (supabase as any)
    .from('journal_lines')
    .insert(lines.map((l) => ({ ...l, entry_id: entry.id })));
  if (linesErr) throw new Error(linesErr.message);
}
