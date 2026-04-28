import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getWebPush() {
  const mod = await import('web-push');
  const webpush = mod.default;
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL ?? 'admin@elm-app.click'}`,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  return webpush;
}

const STATUS_NOTIF: Record<string, { title: string; body: (ref: string, biz: string) => string }> = {
  en_cours: {
    title: '🛠️ Prise en charge',
    body:  (ref, biz) => `${ref} est en cours de traitement chez ${biz}.`,
  },
  termine: {
    title: '✅ Travaux terminés',
    body:  (ref, biz) => `${ref} est prêt ! Vous pouvez passer récupérer votre objet chez ${biz}.`,
  },
  paye: {
    title: '💰 Paiement confirmé',
    body:  (ref, biz) => `Le paiement pour ${ref} a bien été enregistré. Merci !`,
  },
};

export async function POST(req: NextRequest) {
  const { serviceOrderId, status, orderRef, businessName, trackingUrl } = await req.json();
  if (!serviceOrderId || !status) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  }

  const notif = STATUS_NOTIF[status];
  if (!notif) return NextResponse.json({ ok: true, skipped: true });

  // Find tracking token for this service order
  const { data: tokenRow } = await supabaseAdmin
    .from('client_tracking_tokens')
    .select('token')
    .eq('service_order_id', serviceOrderId)
    .maybeSingle();

  if (!tokenRow?.token) return NextResponse.json({ ok: true, skipped: 'no token' });

  // Find all client push subscriptions for this token
  const { data: subs } = await supabaseAdmin
    .from('client_push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('token', tokenRow.token);

  if (!subs?.length) return NextResponse.json({ ok: true, skipped: 'no subs' });

  const payload = JSON.stringify({
    title:   notif.title,
    body:    notif.body(orderRef ?? serviceOrderId.slice(0, 8), businessName ?? 'votre prestataire'),
    url:     trackingUrl ?? `/track/${tokenRow.token}`,
    vibrate: [200, 100, 200],
    tag:     `ot-${serviceOrderId}`,
  });

  const webpush = await getWebPush();

  await Promise.allSettled(
    subs.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      ).catch(async (err) => {
        if (err.statusCode === 410) {
          await supabaseAdmin
            .from('client_push_subscriptions')
            .delete()
            .eq('endpoint', sub.endpoint);
        }
      }),
    ),
  );

  return NextResponse.json({ ok: true, sent: subs.length });
}
