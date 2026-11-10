import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { LOOV_FINAL_STATUSES, type LoovPayment, type LoovStatus } from '@/lib/loov';

// Paiement des abonnements par Loov — import ONLY in server route handlers under app/api/.

export interface SubscriptionPaymentRow {
  id:             string;
  business_id:    string;
  plan_id:        string;
  initiated_by:   string | null;
  reference:      string | null;
  operator:       string;
  phone_number:   string;
  amount:         number;
  currency:       string;
  days:           number;
  status:         LoovStatus;
  failure_code:   string | null;
  failure_reason: string | null;
  livemode:       boolean;
  applied_at:     string | null;
  invoice_id:     string | null;
  created_at:     string;
}

/** Vue renvoyée au navigateur. */
export function toClientPayment(row: SubscriptionPaymentRow) {
  return {
    id:             row.id,
    status:         row.status,
    operator:       row.operator,
    amount:         Number(row.amount),
    currency:       row.currency,
    livemode:       row.livemode,
    activated:      !!row.applied_at,
    failure_code:   row.failure_code,
    failure_reason: row.failure_reason,
  };
}

// Appels depuis Electron (elmpos://) et Capacitor : origine différente du site.
// Pas de cookie — l'auth passe par le Bearer, donc « * » ne donne rien à un tiers.
export function billingCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export function billingJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: billingCorsHeaders() });
}

export type BillingContext = { admin: SupabaseClient; userId: string };

/** Appelant authentifié (Bearer = access token Supabase). */
export async function requireUser(req: NextRequest): Promise<BillingContext | { response: NextResponse }> {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return { response: billingJson({ error: 'Session manquante. Reconnectez-vous.' }, 401) };

  let admin: SupabaseClient;
  try {
    admin = getSupabaseAdmin();
  } catch {
    return { response: billingJson({ error: 'Configuration serveur incomplète' }, 500) };
  }

  const { data: { user }, error } = await admin.auth.getUser(auth.slice(7));
  if (error || !user) return { response: billingJson({ error: 'Session invalide ou expirée. Reconnectez-vous.' }, 401) };
  return { admin, userId: user.id };
}

/** Seuls le propriétaire et les admins de l'établissement paient son abonnement. */
export async function canManageBilling(admin: SupabaseClient, userId: string, businessId: string): Promise<boolean> {
  const [{ data: member }, { data: biz }, { data: profile }] = await Promise.all([
    admin.from('business_members').select('role')
      .eq('business_id', businessId).eq('user_id', userId).in('role', ['owner', 'admin']).maybeSingle(),
    admin.from('businesses').select('owner_id').eq('id', businessId).maybeSingle(),
    admin.from('users').select('is_superadmin').eq('id', userId).maybeSingle(),
  ]);
  return !!member || biz?.owner_id === userId || !!profile?.is_superadmin;
}

/**
 * Reporte l'état Loov sur la tentative et active l'abonnement s'il est payé.
 * Idempotent : appelé par le webhook ET par le polling, éventuellement en même temps
 * (apply_subscription_payment verrouille la ligne et n'encaisse qu'une fois).
 */
export async function syncFromLoov(
  admin: SupabaseClient,
  row:   SubscriptionPaymentRow,
  loov:  LoovPayment,
): Promise<SubscriptionPaymentRow> {
  // Un état final ne bouge plus — sauf vers « succeeded » : de l'argent encaissé active
  // toujours l'abonnement, même après un « expired » posé de notre côté.
  const alreadyFinal = LOOV_FINAL_STATUSES.includes(row.status) && !(loov.status === 'succeeded' && row.status !== 'succeeded');

  let status       = loov.status;
  let failureCode  = loov.failure?.code ?? null;
  let failureReason = loov.failure?.reason ?? loov.failure?.message ?? null;

  // Montant et devise viennent du plan, côté serveur : tout écart est refusé
  if (status === 'succeeded' && (Number(loov.amount) !== Number(row.amount) || loov.currency !== row.currency)) {
    console.error('[loov] montant inattendu', { payment: row.id, reference: loov.reference, expected: row.amount, got: loov.amount, currency: loov.currency });
    status        = 'failed';
    failureCode   = 'amount_mismatch';
    failureReason = 'Le montant payé ne correspond pas au plan. Contactez le support.';
  }

  const patch: Record<string, unknown> = {};
  if (loov.reference && loov.reference !== row.reference) {
    patch.reference = loov.reference;
    patch.livemode  = loov.livemode;
  }
  if (!alreadyFinal && status !== row.status) {
    Object.assign(patch, { status, failure_code: failureCode, failure_reason: failureReason });
  }

  let next = row;
  if (Object.keys(patch).length > 0) {
    patch.updated_at = new Date().toISOString();
    const { data, error } = await admin
      .from('subscription_payments').update(patch).eq('id', row.id).select('*').single();
    if (error) throw new Error(error.message);
    next = data as SubscriptionPaymentRow;
  }

  if (next.status === 'succeeded' && !next.applied_at) {
    const { error } = await admin.rpc('apply_subscription_payment', { p_payment_id: next.id });
    if (error) throw new Error(`Activation de l'abonnement impossible : ${error.message}`);
    const { data } = await admin.from('subscription_payments').select('*').eq('id', next.id).single();
    if (data) next = data as SubscriptionPaymentRow;
  }

  return next;
}
