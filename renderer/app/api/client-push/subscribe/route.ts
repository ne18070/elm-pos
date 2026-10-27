import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

/** Abonne un navigateur (Web Push) au suivi d'un OT. Le jeton de suivi fait office de secret. */
export async function POST(req: NextRequest) {
  const { token, subscription } = await req.json().catch(() => ({}));
  const endpoint = subscription?.endpoint;
  const p256dh   = subscription?.keys?.p256dh;
  const auth     = subscription?.keys?.auth;
  if (typeof token !== 'string' || !endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Missing token or subscription' }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();

  // Seul un jeton de suivi valide peut recevoir des abonnements
  const { data: tracking } = await supabaseAdmin
    .from('client_tracking_tokens')
    .select('token')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (!tracking) return NextResponse.json({ error: 'Lien de suivi invalide ou expiré' }, { status: 404 });

  const { error } = await supabaseAdmin
    .from('client_push_subscriptions')
    .upsert({ token, endpoint, p256dh, auth }, { onConflict: 'token,endpoint' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
