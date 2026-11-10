import { NextRequest } from 'next/server';
import { createMobileMoneyPayment, isLoovConfigured, LoovError } from '@/lib/loov';
import { isLoovOperator, normalizeSenegalPhone, LOOV_CURRENCY, LOOV_MIN_AMOUNT } from '@/lib/loov-operators';
import {
  billingCorsHeaders, billingJson, canManageBilling, requireUser, syncFromLoov, toClientPayment,
  type SubscriptionPaymentRow,
} from '@/lib/subscription-payments';

export const runtime = 'nodejs';

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.elm-app.click').replace(/\/$/, '');
}

/** Loov n'accepte qu'une URL HTTPS publique ; sinon il utilise l'URL de webhook de l'application. */
function callbackUrl(): string | undefined {
  const url = process.env.LOOV_CALLBACK_URL || `${siteUrl()}/api/webhooks/loov`;
  return url.startsWith('https://') && !url.includes('localhost') ? url : undefined;
}

const LOOV_ERROR_MESSAGES: Record<string, string> = {
  validation_failed:      'Numéro de téléphone refusé par l\'opérateur. Vérifiez-le.',
  route_not_available:    'Cet opérateur est momentanément indisponible. Essayez-en un autre.',
  provider_not_available: 'Cet opérateur est momentanément indisponible. Essayez-en un autre.',
  otp_required:           'Code de validation requis : composez #144#391# pour l\'obtenir, puis saisissez-le.',
  rate_limited:           'Trop de tentatives. Réessayez dans une minute.',
  account_not_active:     'Le paiement en ligne est momentanément indisponible. Contactez le support.',
  unauthorized:           'Le paiement en ligne est momentanément indisponible. Contactez le support.',
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: billingCorsHeaders() });
}

export async function POST(req: NextRequest) {
  if (!isLoovConfigured()) return billingJson({ error: "Le paiement en ligne n'est pas encore activé." }, 503);
  const ctx = await requireUser(req);
  if ('response' in ctx) return ctx.response;
  const { admin, userId } = ctx;

  const body = await req.json().catch(() => null) as {
    businessId?: string; planId?: string; operator?: string; phone?: string; otp?: string;
  } | null;
  if (!body?.businessId || !body.planId) return billingJson({ error: 'Établissement et plan requis.' }, 400);
  if (!isLoovOperator(body.operator)) return billingJson({ error: 'Choisissez un opérateur.' }, 400);
  const phone = normalizeSenegalPhone(body.phone ?? '');
  if (!phone) return billingJson({ error: 'Numéro invalide : 9 chiffres commençant par 7 (ex. 77 123 45 67).' }, 400);
  const otp = body.otp?.replace(/\s/g, '') || undefined;

  if (!(await canManageBilling(admin, userId, body.businessId))) {
    return billingJson({ error: 'Seuls le propriétaire et les administrateurs peuvent payer l\'abonnement.' }, 403);
  }

  const { data: allowed } = await admin.rpc('check_rate_limit', {
    p_key: `loov_pay:${userId}`, p_max_count: 6, p_window_seconds: 600,
  });
  if (allowed === false) return billingJson({ error: 'Trop de tentatives de paiement. Réessayez dans quelques minutes.' }, 429);

  const [{ data: plan }, { data: profile }, { data: biz }] = await Promise.all([
    admin.from('plans').select('id, label, price, currency, duration_days, is_active').eq('id', body.planId).maybeSingle(),
    admin.from('users').select('email, full_name').eq('id', userId).maybeSingle(),
    admin.from('businesses').select('name').eq('id', body.businessId).maybeSingle(),
  ]);
  if (!plan?.is_active) return billingJson({ error: 'Ce plan n\'est plus disponible.' }, 400);
  if (!biz) return billingJson({ error: 'Établissement introuvable.' }, 404);
  const amount = Number(plan.price);
  if (plan.currency !== LOOV_CURRENCY || !Number.isInteger(amount) || amount < LOOV_MIN_AMOUNT) {
    return billingJson({ error: 'Ce plan ne peut pas être réglé par mobile money. Contactez le support.' }, 400);
  }

  const { data: row, error: insertError } = await admin
    .from('subscription_payments')
    .insert({
      business_id:  body.businessId,
      plan_id:      plan.id,
      initiated_by: userId,
      operator:     body.operator,
      phone_number: phone,
      amount,
      currency:     plan.currency,
      days:         plan.duration_days,
    })
    .select('*')
    .single();
  if (insertError || !row) return billingJson({ error: 'Impossible de démarrer le paiement. Réessayez.' }, 500);
  const payment = row as SubscriptionPaymentRow;

  try {
    const loov = await createMobileMoneyPayment({
      amount,
      currency:          plan.currency,
      operator:          body.operator,
      phoneNumber:       phone,
      otp,
      customer:          { name: profile?.full_name || biz.name, email: profile?.email ?? '' },
      merchantReference: payment.id,
      description:       `Abonnement ELM ${plan.label} — ${biz.name}`.slice(0, 200),
      callbackUrl:       callbackUrl(),
      metadata:          { business_id: body.businessId, plan_id: plan.id, payment_id: payment.id },
    });

    // Loov peut refuser d'emblée (statut « failed » dès la création) : la raison est enregistrée ici
    if (loov.status === 'failed') {
      console.warn('[loov] refus immédiat', { payment: payment.id, reference: loov.reference, failure: loov.failure });
    }
    const synced = await syncFromLoov(admin, payment, loov).catch(() => payment);

    return billingJson({
      payment:      toClientPayment(synced),
      checkout_url: loov.checkout_url,
    }, 201);
  } catch (e) {
    if (e instanceof LoovError) {
      // Refus explicite de Loov : rien n'a été débité
      if (e.status >= 400 && e.status < 500) {
        await admin.from('subscription_payments')
          .update({ status: 'failed', failure_code: e.code, failure_reason: e.message, updated_at: new Date().toISOString() })
          .eq('id', payment.id);
        console.warn('[loov] paiement refusé', { payment: payment.id, code: e.code, details: e.details });
        return billingJson({
          error: LOOV_ERROR_MESSAGES[e.code] ?? 'Paiement refusé. Vérifiez le numéro ou essayez un autre opérateur.',
          code:  e.code,
        }, e.code === 'otp_required' ? 422 : 400);
      }
    }
    // Timeout / 5xx : la demande a peut-être abouti chez Loov. On garde la tentative
    // « pending » ; le polling la retrouvera par merchant_reference.
    console.error('[loov] création incertaine', { payment: payment.id, error: String(e) });
    return billingJson({ payment: toClientPayment(payment), checkout_url: null }, 202);
  }
}
