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
}

// -- Lecture -------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export async function getSubscription(_userId?: string, _businessId?: string | null): Promise<Subscription | null> {
  const { data, error } = await (supabase as any).rpc('get_my_subscription');
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
  const { data, error } = await (supabase as any).rpc('get_all_subscriptions');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function activateSubscription(
  businessId: string,
  planId:     string,
  days:       number,
  note?:      string
): Promise<void> {
  const { error } = await (supabase as any).rpc('activate_subscription', {
    p_business_id: businessId,
    p_plan_id:     planId,
    p_days:        days,
    p_note:        note ?? null,
  });
  if (error) throw new Error(error.message);
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
    const { error } = await db.from('plans').insert(plan);
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
  }));
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
  }));
}

export async function approveSubscriptionRequest(
  requestId:  string,
  businessId: string,
  planId:     string,
  days:       number,
  note?:      string,
): Promise<void> {
  await activateSubscription(businessId, planId, days, note);
  const { error } = await db
    .from('subscription_requests')
    .update({ status: 'approved', processed_at: new Date().toISOString() })
    .eq('id', requestId);
  if (error) throw new Error(error.message);
}

export async function rejectSubscriptionRequest(requestId: string, note?: string): Promise<void> {
  const { error } = await db
    .from('subscription_requests')
    .update({ status: 'rejected', processed_at: new Date().toISOString(), note: note ?? null })
    .eq('id', requestId);
  if (error) throw new Error(error.message);
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
  password:      string | null;
  status:        'pending' | 'approved' | 'rejected';
  note:          string | null;
  created_at:    string;
  processed_at:  string | null;
}

export async function getPublicSubscriptionRequests(): Promise<PublicSubscriptionRequest[]> {
  const { data, error } = await db
    .from('public_subscription_requests')
    .select('*, plans(label, price, currency)')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, any>) => ({
    ...r,
    plan_label:    r.plans?.label    ?? '-',
    plan_price:    r.plans?.price    ?? null,
    plan_currency: r.plans?.currency ?? null,
  }));
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

export async function approvePublicRequest(
  requestId:  string,
  req:        PublicSubscriptionRequest,
  planId:     string,
  days:       number,
  note?:      string,
): Promise<void> {
  // Import admin client dynamically
  const { supabaseAdmin: admin } = await import('./admin');
  if (!admin) throw new Error("Accès refusé : clé de service manquante dans cet environnement.");

  const password = req.password ?? Math.random().toString(36).slice(-10) + 'A1!';
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email:          req.email,
    password,
    email_confirm:  true,
    user_metadata: {
      full_name: req.full_name || req.business_name,
    }
  });
  if (authError) throw new Error(authError.message);
  const userId = authData.user!.id;

  const { error: userErr } = await admin.from('users').upsert({
    id:        userId,
    email:     req.email,
    full_name: req.full_name || req.business_name,
    role:      'owner',
  }, { onConflict: 'id' });
  if (userErr) throw new Error(userErr.message);

  const { data: bizData, error: bizError } = await admin
    .from('businesses')
    .insert({
      name:         req.business_name,
      denomination: req.denomination || req.business_name,
      owner_id:     userId,
      type:         'retail',
    })
    .select('id')
    .single();
  if (bizError) throw new Error(bizError.message);
  const businessId = bizData.id;

  await admin.from('business_members').insert({
    business_id: businessId,
    user_id:     userId,
    role:        'owner',
  });

  await admin
    .from('users')
    .update({ business_id: businessId })
    .eq('id', userId);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  await activateSubscription(businessId, planId, days, note);

  const { error: reqError } = await db
    .from('public_subscription_requests')
    .update({ status: 'approved', processed_at: new Date().toISOString(), note: note ?? null })
    .eq('id', requestId);
  if (reqError) throw new Error(reqError.message);

  const { sendEmail } = await import('../resend');
  sendEmail({
    type:    'subscription_approved',
    to:      req.email,
    subject: '✅ Votre accès ELM APP est activé',
    data: {
      business_name: req.business_name,
      email:         req.email,
      password,
      plan_label:    req.plan_label ?? 'Pro',
      expires_at:    expiresAt.toISOString(),
    },
  }).catch(() => {});
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
