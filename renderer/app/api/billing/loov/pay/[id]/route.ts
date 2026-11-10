import { NextRequest } from 'next/server';
import {
  findPaymentByMerchantReference, getPayment, isLoovTestMode, simulatePayment,
  LOOV_FINAL_STATUSES, type LoovPayment,
} from '@/lib/loov';
import {
  billingCorsHeaders, billingJson, canManageBilling, requireUser, syncFromLoov, toClientPayment,
  type BillingContext, type SubscriptionPaymentRow,
} from '@/lib/subscription-payments';

export const runtime = 'nodejs';

// Au-delà, une tentative jamais vue par Loov (création perdue) est abandonnée
const LOST_ATTEMPT_MS = 30 * 60_000;

type Params = { params: { id: string } };

export function OPTIONS() {
  return new Response(null, { status: 204, headers: billingCorsHeaders() });
}

async function loadOwnPayment(ctx: BillingContext, id: string) {
  const { data } = await ctx.admin.from('subscription_payments').select('*').eq('id', id).maybeSingle();
  const row = data as SubscriptionPaymentRow | null;
  if (!row || !(await canManageBilling(ctx.admin, ctx.userId, row.business_id))) return null;
  return row;
}

/** Statut à jour : interroge Loov tant que la tentative n'est pas finale. */
export async function GET(req: NextRequest, { params }: Params) {
  const ctx = await requireUser(req);
  if ('response' in ctx) return ctx.response;

  let row = await loadOwnPayment(ctx, params.id);
  if (!row) return billingJson({ error: 'Paiement introuvable.' }, 404);

  const isFinal = LOOV_FINAL_STATUSES.includes(row.status);
  const needsActivation = row.status === 'succeeded' && !row.applied_at;
  if (!isFinal || needsActivation) {
    try {
      const loov: LoovPayment | null = row.reference
        ? await getPayment(row.reference)
        : await findPaymentByMerchantReference(row.id);
      if (loov) {
        row = await syncFromLoov(ctx.admin, row, loov);
      } else if (Date.now() - new Date(row.created_at).getTime() > LOST_ATTEMPT_MS) {
        const { data } = await ctx.admin.from('subscription_payments')
          .update({ status: 'expired', failure_code: 'not_found', updated_at: new Date().toISOString() })
          .eq('id', row.id).select('*').single();
        if (data) row = data as SubscriptionPaymentRow;
      }
    } catch (e) {
      // Loov injoignable : on renvoie le dernier état connu, le client réessaiera
      console.warn('[loov] statut indisponible', { payment: row.id, error: String(e) });
    }
  }

  return billingJson({ payment: toClientPayment(row) });
}

/** Clés de test uniquement : simule la réponse du client sur son téléphone. */
export async function POST(req: NextRequest, { params }: Params) {
  if (!isLoovTestMode()) return billingJson({ error: 'Disponible en mode test uniquement.' }, 403);
  const ctx = await requireUser(req);
  if ('response' in ctx) return ctx.response;

  const row = await loadOwnPayment(ctx, params.id);
  if (!row?.reference) return billingJson({ error: 'Paiement introuvable.' }, 404);

  const body = await req.json().catch(() => null) as { outcome?: string } | null;
  const outcome = body?.outcome === 'failed' ? 'failed' : 'succeeded';
  const loov = await simulatePayment(row.reference, outcome);
  const next = await syncFromLoov(ctx.admin, row, loov);
  return billingJson({ payment: toClientPayment(next) });
}
