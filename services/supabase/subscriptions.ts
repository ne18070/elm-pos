import { supabase } from './client';

export interface Subscription {
  business_id:   string;
  owner_id:      string | null;
  plan_id:       string | null;
  status:        'trial' | 'active' | 'expired';
  trial_ends_at: string | null;
  expires_at:    string | null;
  activated_at:  string | null;
  payment_note:  string | null;
}

export interface Plan {
  id:           string;
  name:         string;
  label:        string;
  price:        number;
  currency:     string;
  duration_days: number;
  features:     string[];
  is_active:    boolean;
  sort_order:   number;
}

export interface PaymentSettings {
  wave_qr_url:     string | null;
  om_qr_url:       string | null;
  whatsapp_number: string;
  // Mentions légales du vendeur, imprimées sur les factures d'abonnement
  invoice_company_name: string | null;
  invoice_address:      string | null;
  invoice_ninea:        string | null;
  invoice_rccm:         string | null;
  invoice_email:        string | null;
}

/** Facture d'abonnement — figée à l'émission (acheteur, plan, montant copiés). */
export interface SubscriptionInvoice {
  id:               string;
  invoice_number:   string;
  business_id:      string | null;
  plan_label:       string;
  quantity:         number;
  unit_price:       number;
  amount:           number;
  currency:         string;
  period_start:     string;
  period_end:       string;
  buyer_name:       string;
  buyer_legal_name: string | null;
  buyer_email:      string | null;
  payment_note:     string | null;
  issued_at:        string;
}

// -- Lecture -------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase;

export async function getSubscription(_userId?: string, _businessId?: string | null): Promise<Subscription | null> {
  const { data, error } = await supabase.rpc('get_my_subscription');
  if (!error && data && (data as Subscription[]).length > 0) {
    return (data as Subscription[])[0];
  }
  return null;
}

export async function getPlans(): Promise<Plan[]> {
  const { data } = await db
    .from('plans')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');
  return (data ?? []) as Plan[];
}

export async function getPaymentSettings(): Promise<PaymentSettings | null> {
  const { data } = await db
    .from('payment_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  return data as PaymentSettings | null;
}

// -- Calculs côté client -------------------------------------------------------

export type EffectiveStatus = 'trial' | 'active' | 'expired' | 'none';

export function getEffectiveStatus(sub: Subscription | null): EffectiveStatus {
  if (!sub) return 'none';
  if (sub.status === 'active') {
    if (sub.expires_at && new Date(sub.expires_at) < new Date()) return 'expired';
    return 'active';
  }
  if (sub.status === 'trial') {
    if (sub.trial_ends_at && new Date(sub.trial_ends_at) < new Date()) return 'expired';
    return 'trial';
  }
  return 'expired';
}

export function getTrialDaysRemaining(sub: Subscription | null): number {
  if (!sub?.trial_ends_at) return 0;
  const diff = new Date(sub.trial_ends_at).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

// -- Back office ---------------------------------------------------------------

export interface SubscriptionRow {
  owner_id:      string | null;
  owner_email:   string | null;
  owner_name:    string | null;
  business_id:   string;
  business_name: string;
  businesses:    { id: string; name: string }[];
  plan_label:    string | null;
  plan_price:    number | null;
  plan_currency: string | null;
  status:        string;
  trial_ends_at: string | null;
  expires_at:    string | null;
  activated_at:  string | null;
  payment_note:  string | null;
}

export async function getAllSubscriptions(): Promise<SubscriptionRow[]> {
  const { data, error } = await supabase.rpc('get_all_subscriptions');
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as SubscriptionRow[];
}

/**
 * Superadmin. Émet aussi la facture de la période.
 * amount : montant facturé ; absent = prix du plan × nombre de périodes, 0 = pas de facture.
 */
export async function activateSubscription(
  businessId: string,
  planId:     string,
  days:       number,
  note?:      string,
  amount?:    number,
): Promise<void> {
  const { error } = await supabase.rpc('activate_subscription', {
    p_business_id: businessId,
    p_plan_id:     planId,
    p_days:        days,
    p_note:        note ?? undefined,
    p_amount:      amount ?? undefined,
  });
  if (error) throw new Error(error.message);
}

/** Superadmin : factures émises depuis une date (montant + devise seulement, pour les KPI). */
export async function getInvoiceTotalsSince(sinceIso: string): Promise<Pick<SubscriptionInvoice, 'amount' | 'currency'>[]> {
  const { data, error } = await db
    .from('subscription_invoices')
    .select('amount, currency')
    .gte('issued_at', sinceIso);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Factures visibles par l'utilisateur courant (RLS : titulaire, owner/admin, superadmin). */
export async function getMySubscriptionInvoices(): Promise<SubscriptionInvoice[]> {
  const { data, error } = await db
    .from('subscription_invoices')
    .select('id, invoice_number, business_id, plan_label, quantity, unit_price, amount, currency, period_start, period_end, buyer_name, buyer_legal_name, buyer_email, payment_note, issued_at')
    .order('issued_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SubscriptionInvoice[];
}

export async function upsertPaymentSettings(settings: Partial<PaymentSettings>): Promise<void> {
  const { error } = await db
    .from('payment_settings')
    .update({ ...settings, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) throw new Error(error.message);
}

export async function upsertPlan(plan: Partial<Plan> & { id?: string }): Promise<void> {
  if (plan.id) {
    const { error } = await db.from('plans').update(plan).eq('id', plan.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await db.from('plans').insert(plan as unknown as import('./database.types').TablesInsert<'plans'>);
    if (error) throw new Error(error.message);
  }
}

// -- Demandes d'abonnement -----------------------------------------------------

export interface SubscriptionRequest {
  id:           string;
  business_id:  string;
  business_name: string;
  plan_id:      string | null;
  plan_label:   string | null;
  plan_price:   number | null;
  plan_currency: string | null;
  receipt_url:  string;
  status:       'pending' | 'approved' | 'rejected';
  note:         string | null;
  created_at:   string;
  processed_at: string | null;
}

export async function uploadReceipt(businessId: string, file: File): Promise<string> {
  const BUCKET = 'product-images';
  const ext    = file.name.split('.').pop() ?? 'jpg';
  const path   = `receipts/${businessId}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function submitSubscriptionRequest(
  businessId: string,
  planId:     string,
  receiptUrl: string,
): Promise<void> {
  const { error } = await db
    .from('subscription_requests')
    .insert({ business_id: businessId, plan_id: planId, receipt_url: receiptUrl });
  if (error) throw new Error(error.message);
}

export async function getSubscriptionRequests(): Promise<SubscriptionRequest[]> {
  const { data, error } = await db
    .from('subscription_requests')
    .select('*, businesses(name), plans(label, price, currency)')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, any>) => ({
    ...r,
    business_name: r.businesses?.name ?? '-',
    plan_label:    r.plans?.label    ?? '-',
    plan_price:    r.plans?.price    ?? null,
    plan_currency: r.plans?.currency ?? null,
  })) as unknown as SubscriptionRequest[];
}

export async function getMySubscriptionRequests(businessId: string): Promise<SubscriptionRequest[]> {
  const { data, error } = await db
    .from('subscription_requests')
    .select('*, plans(label, price, currency)')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, any>) => ({
    ...r,
    business_name: '',
    plan_label:    r.plans?.label    ?? '-',
    plan_price:    r.plans?.price    ?? null,
    plan_currency: r.plans?.currency ?? null,
  })) as unknown as SubscriptionRequest[];
}

export async function approveSubscriptionRequest(
  requestId:  string,
  businessId: string,
  planId:     string,
  days:       number,
  note?:      string,
): Promise<void> {
  // Fetch owner email + business name + plan label before approving
  const [{ data: bizData }, { data: planData }] = await Promise.all([
    db.from('businesses').select('name, owner_id').eq('id', businessId).single(),
    db.from('plans').select('label').eq('id', planId).single(),
  ]);
  const { data: userData } = bizData?.owner_id
    ? await db.from('users').select('email, full_name').eq('id', bizData.owner_id).single()
    : { data: null };

  await activateSubscription(businessId, planId, days, note);

  const { error } = await db
    .from('subscription_requests')
    .update({ status: 'approved', processed_at: new Date().toISOString() })
    .eq('id', requestId);
  if (error) throw new Error(error.message);

  // Send confirmation email (non-blocking)
  if (userData?.email) {
    const expiresAt = new Date(Date.now() + days * 86_400_000);
    const { sendEmail } = await import('../resend');
    sendEmail({
      type:    'subscription_approved',
      to:      userData.email,
      subject: '✅ Votre accès ELM APP est activé',
      data: {
        business_name: bizData?.name ?? '',
        email:         userData.email,
        plan_label:    planData?.label ?? 'Pro',
        expires_at:    expiresAt.toISOString(),
      },
    }).catch(() => {});
  }
}

export async function rejectSubscriptionRequest(requestId: string, note?: string): Promise<void> {
  // Fetch business info to notify owner (before update so we have context)
  const { data: reqData } = await db
    .from('subscription_requests')
    .select('business_id, businesses(name, owner_id)')
    .eq('id', requestId)
    .single();
  const biz      = (reqData as any)?.businesses;
  const ownerId  = biz?.owner_id;
  const { data: userData } = ownerId
    ? await db.from('users').select('email').eq('id', ownerId).single()
    : { data: null };

  const { error } = await db
    .from('subscription_requests')
    .update({ status: 'rejected', processed_at: new Date().toISOString(), note: note ?? null })
    .eq('id', requestId);
  if (error) throw new Error(error.message);

  // Send rejection email (non-blocking)
  if (userData?.email) {
    const { sendEmail } = await import('../resend');
    sendEmail({
      type:    'subscription_rejected',
      to:      userData.email,
      subject: 'Votre demande ELM APP',
      data: { business_name: biz?.name ?? '', note },
    }).catch(() => {});
  }
}

// -- Demandes publiques --------------------------------------------------------

export interface PublicSubscriptionRequest {
  id:            string;
  business_name: string;
  denomination:  string | null;
  email:         string;
  full_name:     string | null;
  phone:         string | null;
  plan_id:       string | null;
  plan_label:    string | null;
  plan_price:    number | null;
  plan_currency: string | null;
  receipt_url:   string | null;
  status:        'pending' | 'approved' | 'rejected';
  note:          string | null;
  created_at:    string;
  processed_at:  string | null;
}

export async function getPublicSubscriptionRequests(): Promise<PublicSubscriptionRequest[]> {
  const { data, error } = await db
    .from('public_subscription_requests')
    // Colonnes explicites : ne jamais rapatrier l'ancienne colonne password
    .select('id, business_name, denomination, email, full_name, phone, plan_id, receipt_url, status, note, created_at, processed_at, plans(label, price, currency)')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, any>) => ({
    ...r,
    plan_label:    r.plans?.label    ?? '-',
    plan_price:    r.plans?.price    ?? null,
    plan_currency: r.plans?.currency ?? null,
  })) as unknown as PublicSubscriptionRequest[];
}

export async function rejectPublicRequest(requestId: string, note?: string, req?: Pick<PublicSubscriptionRequest, 'email' | 'business_name'>): Promise<void> {
  const { error } = await db
    .from('public_subscription_requests')
    .update({ status: 'rejected', processed_at: new Date().toISOString(), note: note ?? null })
    .eq('id', requestId);
  if (error) throw new Error(error.message);

  if (req?.email) {
    const { sendEmail } = await import('../resend');
    sendEmail({
      type:    'subscription_rejected',
      to:      req.email,
      subject: 'Votre demande ELM APP',
      data: { business_name: req.business_name, note },
    }).catch(() => {});
  }
}

/**
 * Superadmin. Sans organizationId : supprime le compte et tout ce qu'il possède.
 * Avec : supprime seulement cette organisation (et le compte s'il ne lui reste rien).
 */
export async function deleteAccount(ownerId: string, organizationId?: string): Promise<{ accountDeleted: boolean }> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/api/admin/delete-account', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify({ ownerId, organizationId }),
  });
  const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw new Error(body.error ?? 'Erreur lors de la suppression');
  return { accountDeleted: !!body.accountDeleted };
}

export async function uploadQrCode(type: 'wave' | 'om', file: File): Promise<string> {
  const BUCKET = 'product-images';
  const ext    = file.name.split('.').pop() ?? 'png';
  const path   = `backoffice/qr-${type}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function deleteSubscriptionRequest(requestId: string): Promise<void> {
  const { error } = await db
    .from('subscription_requests')
    .delete()
    .eq('id', requestId);
  if (error) throw new Error(error.message);
}

export async function deletePublicSubscriptionRequest(requestId: string): Promise<void> {
  const { error } = await db
    .from('public_subscription_requests')
    .delete()
    .eq('id', requestId);
  if (error) throw new Error(error.message);
}
