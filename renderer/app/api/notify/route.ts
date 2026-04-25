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

function buildNotification(table: string, record: Record<string, unknown>) {
  if (table === 'hotel_reservations' || 'confirmation_token' in record) {
    return {
      title: 'Nouvelle reservation hotel',
      body: `Chambre reservee du ${record.check_in} au ${record.check_out}`,
      url: '/hotel',
    };
  }

  if (table === 'contracts' || ('token' in record && 'client_name' in record)) {
    return {
      title: 'Nouvelle demande de location',
      body: `Demande de ${(record.client_name as string) || 'un client'} du ${record.start_date} au ${record.end_date}`,
      url: '/contrats',
    };
  }

  if (table === 'dossiers' || ('reference' in record && 'date_audience' in record)) {
    return {
      title: 'Nouveau rendez-vous juridique',
      body: `Demande de ${(record.client_name as string) || 'un client'} pour ${(record.type_affaire as string) || 'une consultation'} le ${record.date_audience ?? 'date a confirmer'}`,
      url: '/dossiers',
    };
  }

  return {
    title: 'Nouvelle commande boutique',
    body: `Commande de ${(record.customer_name as string) || 'un client'}`,
    url: '/orders',
  };
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-webhook-secret');
  if (!secret || secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { type?: string; table?: string; record?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const record = body.record;
  if (!record || record.source !== 'public') {
    return NextResponse.json({ ok: true });
  }

  const businessId = record.business_id as string;
  const table = body.table ?? '';
  const { title, body: bodyText, url } = buildNotification(table, record);

  const { data: subscriptions } = await supabaseAdmin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('business_id', businessId);

  if (!subscriptions?.length) return NextResponse.json({ ok: true });

  const payload = JSON.stringify({ 
    title, 
    body: bodyText,
    url,
    vibrate: [200, 100, 200],
  });
  const webpush = await getWebPush();

  await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush
        .sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        )
        .catch(async (err) => {
          if (err.statusCode === 410) {
            await supabaseAdmin
              .from('push_subscriptions')
              .delete()
              .eq('endpoint', sub.endpoint);
          }
        }),
    ),
  );

  return NextResponse.json({ ok: true });
}
