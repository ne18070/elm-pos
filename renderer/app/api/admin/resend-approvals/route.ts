import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

async function requireSuperadmin(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return 'Token manquant';
  const token = auth.slice(7);
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) return 'Token invalide';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: profile } = await admin.from('users').select('is_superadmin').eq('id', user.id).single();
  if (!profile?.is_superadmin) return 'Accès superadmin requis';
  return null;
}

export async function POST(req: NextRequest) {
  const authError = await requireSuperadmin(req);
  if (authError) return NextResponse.json({ error: authError }, { status: 403 });

  const url        = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const body = await req.json().catch(() => ({}));
  const bearerToken = req.headers.get('authorization') ?? '';

  // Mode unitaire : un email spécifique passé dans le body
  if (body.email) {
    const res = await fetch(`${url}/functions/v1/send-email`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': bearerToken },
      body: JSON.stringify({
        type:    'subscription_approved',
        to:      body.email,
        subject: '✅ Votre accès ELM APP est activé',
        data: {
          business_name: body.business_name ?? '',
          email:         body.email,
          plan_label:    body.plan_label ?? 'Pro',
          expires_at:    null,
        },
      }),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) return NextResponse.json({ error: result.error ?? 'Erreur envoi' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Mode batch : tous les approuvés d'aujourd'hui
  const today = new Date().toISOString().slice(0, 10);
  const { data: requests, error } = await admin
    .from('public_subscription_requests')
    .select('id, email, business_name, plan_label, processed_at')
    .eq('status', 'approved')
    .gte('processed_at', `${today}T00:00:00`)
    .lte('processed_at', `${today}T23:59:59`);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: { email: string; ok: boolean; error?: string }[] = [];

  for (const r of requests ?? []) {
    const res = await fetch(`${url}/functions/v1/send-email`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': bearerToken },
      body: JSON.stringify({
        type:    'subscription_approved',
        to:      r.email,
        subject: '✅ Votre accès ELM APP est activé',
        data: {
          business_name: r.business_name,
          email:         r.email,
          plan_label:    r.plan_label ?? 'Pro',
          expires_at:    null,
        },
      }),
    });
    const body = await res.json().catch(() => ({}));
    results.push({ email: r.email, ok: res.ok, error: res.ok ? undefined : body.error });
  }

  return NextResponse.json({ count: results.length, results });
}
