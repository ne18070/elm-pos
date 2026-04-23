import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

webpush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL ?? 'admin@elm-app.click'}`,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

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
  const table      = body.table ?? '';

  let title: string;
  let bodyText: string;

  if (table === 'hotel_reservations' || 'confirmation_token' in record) {
    title    = '🏨 Nouvelle réservation hôtel';
    bodyText = `Chambre réservée du ${record.check_in} au ${record.check_out}`;
  } else if (table === 'contracts' || ('token' in record && 'client_name' in record)) {
    title    = '🚗 Nouvelle demande de location';
    bodyText = `Demande de ${(record.client_name as string) || 'un client'} · ${record.start_date} → ${record.end_date}`;
  } else {
    title    = '🛍️ Nouvelle commande boutique';
    bodyText = `Commande de ${(record.customer_name as string) || 'un client'}`;
  }

  const { data: subscriptions } = await supabaseAdmin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('business_id', businessId);

  if (!subscriptions?.length) return NextResponse.json({ ok: true });

  const payload = JSON.stringify({ title, body: bodyText });

  await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      ).catch(async (err) => {
        if (err.statusCode === 410) {
          await supabaseAdmin
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', sub.endpoint);
        }
      })
    )
  );

  return NextResponse.json({ ok: true });
}
