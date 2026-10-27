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

type Admin = ReturnType<typeof getSupabaseAdmin>;

/**
 * L'appelant doit pouvoir agir sur l'OT : membre de l'établissement (Bearer de
 * session, dashboard) ou technicien assigné (jeton de son lien /tech-service).
 */
async function canNotify(
  admin: Admin,
  req: NextRequest,
  order: { business_id: string; assigned_to: string | null },
  technicianToken?: string,
): Promise<boolean> {
  if (technicianToken) {
    const { data: tech } = await admin
      .from('service_order_technician_tokens')
      .select('business_id, staff_id, expires_at')
      .eq('token', technicianToken)
      .maybeSingle();
    return !!tech
      && new Date(tech.expires_at) > new Date()
      && tech.business_id === order.business_id
      && tech.staff_id === order.assigned_to;
  }

  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return false;
  const { data: { user } } = await admin.auth.getUser(auth.slice(7));
  if (!user) return false;
  const { data: member } = await admin
    .from('business_members')
    .select('user_id')
    .eq('business_id', order.business_id)
    .eq('user_id', user.id)
    .maybeSingle();
  return !!member;
}

/**
 * Notifie le client du statut ACTUEL d'un ordre de service : navigateurs abonnés
 * (Web Push, page /track) et app « ELM Boutique » (FCM).
 * Texte, statut et lien sont lus en base — jamais pris dans la requête, sinon
 * n'importe qui pouvait pousser un message et un lien arbitraires au client.
 */
export async function POST(req: NextRequest) {
  const { serviceOrderId, technicianToken } = await req.json().catch(() => ({}));
  if (!serviceOrderId) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();

  const { data: order } = await supabaseAdmin
    .from('service_orders')
    .select('id, business_id, assigned_to, order_number, status, businesses(name)')
    .eq('id', serviceOrderId)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: 'Ordre introuvable' }, { status: 404 });

  if (!(await canNotify(supabaseAdmin, req, order, technicianToken))) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const notif = STATUS_NOTIF[order.status];
  if (!notif) return NextResponse.json({ ok: true, skipped: true });

  // Jetons de suivi valides de l'OT (créé à la demande publique et/ou par le dashboard)
  const { data: tokenRows } = await supabaseAdmin
    .from('client_tracking_tokens')
    .select('token')
    .eq('service_order_id', order.id)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  const tokens = (tokenRows ?? []).map((r) => r.token);
  if (!tokens.length) return NextResponse.json({ ok: true, skipped: 'no token' });

  const business     = order.businesses as unknown as { name: string } | null;
  const orderRef     = `OT-${String(order.order_number).padStart(4, '0')}`;
  const title = notif.title;
  const body  = notif.body(orderRef, business?.name || 'votre prestataire');
  const url   = `/track/${tokens[0]}`;
  const tag   = `ot-${order.id}`;

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
