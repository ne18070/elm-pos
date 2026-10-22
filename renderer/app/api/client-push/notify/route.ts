import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendFcm, isFcmConfigured } from '@/lib/fcm';

export const runtime = 'nodejs';

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

/**
 * Notifie le client d'un changement de statut d'ordre de service :
 * navigateurs abonnés (Web Push, page /track) et app « ELM Boutique » (FCM).
 */
export async function POST(req: NextRequest) {
  const { serviceOrderId, status, orderRef, businessName, trackingUrl } = await req.json();
  if (!serviceOrderId || !status) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  }

  const notif = STATUS_NOTIF[status];
  if (!notif) return NextResponse.json({ ok: true, skipped: true });

  const supabaseAdmin = getSupabaseAdmin();

  // Jetons de suivi valides de l'OT (créé à la demande publique et/ou par le dashboard)
  const { data: tokenRows } = await supabaseAdmin
    .from('client_tracking_tokens')
    .select('token')
    .eq('service_order_id', serviceOrderId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  const tokens = (tokenRows ?? []).map((r) => r.token);
  if (!tokens.length) return NextResponse.json({ ok: true, skipped: 'no token' });

  const title = notif.title;
  const body  = notif.body(orderRef ?? serviceOrderId.slice(0, 8), businessName ?? 'votre prestataire');
  const url   = trackingUrl ?? `/track/${tokens[0]}`;
  const tag   = `ot-${serviceOrderId}`;

  const [{ data: subs }, { data: devices }] = await Promise.all([
    supabaseAdmin
      .from('client_push_subscriptions')
      .select('endpoint, p256dh, auth')
      .in('token', tokens),
    supabaseAdmin
      .from('client_push_devices')
      .select('id, fcm_token')
      .in('tracking_token', tokens),
  ]);

  let webSent = 0;
  if (subs?.length) {
    const webpush = await getWebPush();
    const payload = JSON.stringify({ title, body, url, vibrate: [200, 100, 200], tag });
    const results = await Promise.allSettled(
      subs.map((sub) =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        ).catch(async (err) => {
          if (err.statusCode === 410) {
            await supabaseAdmin.from('client_push_subscriptions').delete().eq('endpoint', sub.endpoint);
          }
          throw err;
        }),
      ),
    );
    webSent = results.filter((r) => r.status === 'fulfilled').length;
  }

  let appSent = 0;
  if (devices?.length && isFcmConfigured()) {
    // L'app ouvre /track/<jeton> : on lui donne l'URL publique complète
    const appUrl = url.startsWith('http')
      ? url
      : `${(process.env.NEXT_PUBLIC_SITE_URL || 'https://www.elm-app.click').replace(/\/$/, '')}${url}`;
    const results = await Promise.all(
      devices.map(async (device) => {
        const result = await sendFcm(device.fcm_token, { title, body, url: appUrl, tag });
        if (result === 'unregistered') {
          await supabaseAdmin.from('client_push_devices').delete().eq('id', device.id);
        }
        return result;
      }),
    );
    appSent = results.filter((r) => r === 'sent').length;
  }

  return NextResponse.json({ ok: true, sent: { web: webSent, app: appSent } });
}
