import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
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
  annule: {
    title: '❌ Ordre annulé',
    body:  (ref, biz) => `${ref} a été annulé par ${biz}. Contactez-les pour plus d'informations.`,
  },
  paye: {
    title: '💰 Paiement confirmé',
    body:  (ref, biz) => `Le paiement pour ${ref} a bien été enregistré. Merci !`,
  },
};

/**
 * Nouvel ordre : prévient les appareils liés au comptoir qu'un ordre est arrivé
 * pour leur numéro. Envoyé uniquement par le trigger de création en base
 * (trg_service_orders_client_app_created, migration 178, via pg_net et le secret
 * CLIENT_PUSH_WEBHOOK_SECRET) — toutes les créations sont couvertes, et un ordre
 * remis en attente plus tard ne redit jamais « enregistré ».
 */
const CREATED_NOTIF = {
  title: '📋 Ordre de travail enregistré',
  body:  (ref: string, biz: string) => `${biz} a enregistré ${ref}. Vous serez prévenu à chaque étape.`,
};
const CREATED_WINDOW_MS = 15 * 60 * 1000;

type Admin = ReturnType<typeof getSupabaseAdmin>;

/** Appel du trigger en base (pg_net) : secret partagé, comparé en temps constant */
function isWebhookCall(req: NextRequest): boolean {
  const expected = process.env.CLIENT_PUSH_WEBHOOK_SECRET;
  const given = req.headers.get('x-webhook-secret');
  return !!expected && !!given && safeEqual(given, expected);
}

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
  // Même règle que le partage du lien et le badge (migration 178)
  const { data: isMember } = await admin.rpc('_is_business_member', {
    p_business_id: order.business_id,
    p_user_id: user.id,
  });
  return isMember === true;
}

/**
 * Notifie le client du statut ACTUEL d'un ordre de service : navigateurs abonnés
 * (Web Push, page /track) et app « ELM Boutique » (FCM) : téléphones abonnés au
 * jeton de suivi ET appareils liés au comptoir (migration 178) pour ce numéro.
 * Texte, statut et lien sont lus en base — jamais pris dans la requête, sinon
 * n'importe qui pouvait pousser un message et un lien arbitraires au client.
 */
const orderRefOf = (order: { order_number: number | null }) =>
  `OT-${String(order.order_number).padStart(4, '0')}`;

export async function POST(req: NextRequest) {
  const { serviceOrderId, technicianToken, event } = await req.json().catch(() => ({}));
  if (!serviceOrderId) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();

  const { data: order } = await supabaseAdmin
    .from('service_orders')
    .select('id, business_id, assigned_to, order_number, status, client_phone, created_at, businesses(name)')
    .eq('id', serviceOrderId)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: 'Ordre introuvable' }, { status: 404 });

  const fromWebhook = isWebhookCall(req);
  if (!fromWebhook && !(await canNotify(supabaseAdmin, req, order, technicianToken))) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  // « Ordre enregistré » : seulement depuis le trigger de création, ordre récent
  const isCreation = fromWebhook && event === 'created';
  const justCreated = !!order.created_at
    && Date.now() - new Date(order.created_at).getTime() < CREATED_WINDOW_MS;
  const notif = isCreation
    ? (justCreated ? CREATED_NOTIF : undefined)
    : STATUS_NOTIF[order.status];
  if (!notif) return NextResponse.json({ ok: true, skipped: true });

  // Appareils liés au comptoir (migration 178) : (boutique, numéro de l'OT), et
  // jetons de suivi valides de l'OT (demande publique, dashboard, app liée)
  const [{ data: linkedRows, error: linkedError }, { data: tokenRows, error: tokenError }] = await Promise.all([
    supabaseAdmin.rpc('client_app_push_targets', { p_service_order_id: order.id }),
    supabaseAdmin
      .from('client_tracking_tokens')
      .select('token')
      .eq('service_order_id', order.id)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }),
  ]);
  // Une erreur ici ne doit pas passer pour « personne à notifier »
  if (linkedError || tokenError) {
    console.error('[client-push/notify] destinataires illisibles', order.id, linkedError ?? tokenError);
    return NextResponse.json({ error: 'Destinataires indisponibles' }, { status: 500 });
  }
  const linked = (linkedRows ?? []) as Array<{ device_id: string; fcm_token: string }>;

  const tokens = (tokenRows ?? []).map((r) => r.token);
  // App liée mais aucun lien jamais envoyé : la notification ouvre quand même le
  // suivi. Jeton créé en base sous verrou (auto_created, pas de doublon)
  if (!tokens.length && linked.length) {
    const { data: created, error: createError } = await supabaseAdmin.rpc('_ensure_tracking_token', {
      p_service_order_id: order.id,
    });
    if (createError || !created) {
      console.error('[client-push/notify] jeton de suivi non créé', order.id, createError);
      return NextResponse.json({ error: 'Lien de suivi indisponible' }, { status: 500 });
    }
    tokens.push(created);
  }
  if (!tokens.length) {
    console.info('[client-push/notify] personne à notifier (aucun suivi ni app liée)', orderRefOf(order));
    return NextResponse.json({ ok: true, skipped: 'no token' });
  }

  const business     = order.businesses as unknown as { name: string } | null;
  const orderRef     = `OT-${String(order.order_number).padStart(4, '0')}`;
  const title = notif.title;
  const body  = notif.body(orderRef, business?.name || 'votre prestataire');
  const url   = `/track/${tokens[0]}`;
  const tag   = `ot-${order.id}`;

  const [{ data: subs }, { data: trackedDevices }] = await Promise.all([
    supabaseAdmin
      .from('client_push_subscriptions')
      .select('endpoint, p256dh, auth')
      .in('token', tokens),
    supabaseAdmin
      .from('client_push_devices')
      .select('id, fcm_token')
      .in('tracking_token', tokens),
  ]);

  // Un même téléphone peut être lié ET abonné au suivi (parfois sous plusieurs
  // jetons de l'OT) : une seule notification, mais toutes ses lignes sont gardées
  // pour être nettoyées si FCM le déclare désinscrit
  const devices = new Map<string, { trackedIds: string[]; linkedIds: string[] }>();
  const entryFor = (fcmToken: string) => {
    const entry = devices.get(fcmToken) ?? { trackedIds: [], linkedIds: [] };
    devices.set(fcmToken, entry);
    return entry;
  };
  for (const d of trackedDevices ?? []) entryFor(d.fcm_token).trackedIds.push(d.id);
  for (const d of linked) entryFor(d.fcm_token).linkedIds.push(d.device_id);

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
  if (devices.size && !isFcmConfigured()) {
    console.error('[client-push/notify] FIREBASE_SERVICE_ACCOUNT_JSON absent ou invalide : app non notifiée', orderRefOf(order));
  }
  if (devices.size && isFcmConfigured()) {
    // L'app ouvre /track/<jeton> : on lui donne l'URL publique complète
    const appUrl = url.startsWith('http')
      ? url
      : `${(process.env.NEXT_PUBLIC_SITE_URL || 'https://www.elm-app.click').replace(/\/$/, '')}${url}`;
    const results = await Promise.all(
      [...devices].map(async ([fcmToken, device]) => {
        // Pastille de l'icône : ordres non lus sur ce téléphone (migration 179).
        // Sans elle la notification part quand même, la pastille reste inchangée.
        const { data: badge, error: badgeError } = await supabaseAdmin.rpc('app_push_badge_increment', {
          p_fcm_token: fcmToken,
          p_tag: tag,
        });
        if (badgeError) console.warn('[client-push/notify] pastille non calculée', badgeError.message);
        const result = await sendFcm(fcmToken, { title, body, url: appUrl, tag, badge: badge ?? undefined });
        if (result === 'unregistered') {
          await supabaseAdmin.rpc('app_push_badge_clear', { p_fcm_token: fcmToken });
          if (device.trackedIds.length) {
            await supabaseAdmin.from('client_push_devices').delete().in('id', device.trackedIds);
          }
          if (device.linkedIds.length) {
            await supabaseAdmin.from('client_app_devices').update({ fcm_token: null }).in('id', device.linkedIds);
          }
        }
        return result;
      }),
    );
    appSent = results.filter((r) => r === 'sent').length;
  }

  console.info('[client-push/notify]', orderRefOf(order), order.status,
    { web: `${webSent}/${subs?.length ?? 0}`, app: `${appSent}/${devices.size}` });
  return NextResponse.json({ ok: true, sent: { web: webSent, app: appSent } });
}
