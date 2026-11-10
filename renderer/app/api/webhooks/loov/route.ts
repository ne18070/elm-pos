import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getPayment, verifyWebhookSignature, type LoovPayment } from '@/lib/loov';
import { syncFromLoov, type SubscriptionPaymentRow } from '@/lib/subscription-payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Webhook Loov (payin.succeeded / payin.failed / payin.expired).
 * Loov réessaie jusqu'à 8 fois tant qu'on ne répond pas 2xx : on ne renvoie une
 * erreur que si l'on veut un nouvel essai (signature invalide = 400, définitif).
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get('loov-signature'))) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });
  }

  let event: { event?: string; data?: LoovPayment };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const data = event.data;
  if (!data?.reference || data.type !== 'payin') return NextResponse.json({ ignored: true });

  const admin = getSupabaseAdmin();
  // merchant_reference = id de la tentative ; la référence Loov peut ne pas encore être
  // enregistrée si la réponse de création s'est perdue.
  const { data: byRef } = await admin.from('subscription_payments').select('*').eq('reference', data.reference).maybeSingle();
  let row = byRef as SubscriptionPaymentRow | null;
  if (!row && data.merchant_reference && /^[0-9a-f-]{36}$/i.test(data.merchant_reference)) {
    const { data: byId } = await admin.from('subscription_payments').select('*').eq('id', data.merchant_reference).maybeSingle();
    row = byId as SubscriptionPaymentRow | null;
  }
  // Paiement étranger aux abonnements (autre intégration du même compte) : accusé de réception
  if (!row) return NextResponse.json({ ignored: true });

  try {
    // L'état fait foi côté API Loov : on le relit plutôt que de croire le corps seul
    const fresh = await getPayment(data.reference).catch(() => data);
    await syncFromLoov(admin, row, fresh);
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error('[loov] webhook non traité', { reference: data.reference, error: String(e) });
    // 500 → Loov renverra la notification
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 });
  }
}
