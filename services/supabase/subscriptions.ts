import { supabase } from './client';

export interface Subscription {
  business_id:   string;
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

// ── Lecture ───────────────────────────────────────────────────────────────────

export async function getSubscription(businessId: string): Promise<Subscription | null> {
  const { data } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('business_id', businessId)
    .single();
  return data as Subscription | null;
}

export async function getPlans(): Promise<Plan[]> {
  const { data } = await supabase
    .from('plans')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');
  return (data ?? []) as Plan[];
}

export async function getPaymentSettings(): Promise<PaymentSettings | null> {
  const { data } = await supabase
    .from('payment_settings')
    .select('*')
    .eq('id', 1)
    .single();
  return data as PaymentSettings | null;
}

// ── Calculs côté client ───────────────────────────────────────────────────────

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

// ── Back office ───────────────────────────────────────────────────────────────

export interface SubscriptionRow {
  business_id:   string;
  business_name: string;
  plan_label:    string | null;
  status:        string;
  trial_ends_at: string | null;
  expires_at:    string | null;
  activated_at:  string | null;
  payment_note:  string | null;
  owner_email:   string | null;
  owner_name:    string | null;
}

export async function getAllSubscriptions(): Promise<SubscriptionRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('activate_subscription', {
    p_business_id: businessId,
    p_plan_id:     planId,
    p_days:        days,
    p_note:        note ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function upsertPaymentSettings(settings: Partial<PaymentSettings>): Promise<void> {
  const { error } = await supabase
    .from('payment_settings')
    .update({ ...settings, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) throw new Error(error.message);
}

export async function upsertPlan(plan: Partial<Plan> & { id?: string }): Promise<void> {
  if (plan.id) {
    const { error } = await supabase.from('plans').update(plan).eq('id', plan.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('plans').insert(plan);
    if (error) throw new Error(error.message);
  }
}

export async function uploadQrCode(type: 'wave' | 'om', file: File): Promise<string> {
  const BUCKET = 'product-images'; // réutilise le bucket existant
  const ext    = file.name.split('.').pop() ?? 'png';
  const path   = `backoffice/qr-${type}-${Date.now()}.${ext}`; // nom unique → toujours un INSERT

  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
