import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { activateSubscription } from '@services/supabase/subscriptions';
import { sendEmail } from '@services/resend';

// ── Auth superadmin via token Bearer ──────────────────────────────────────────
async function requireSuperadmin(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return 'Token manquant';

  const token = auth.slice(7);
  const url    = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon   = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const client = createClient(url, anon, { auth: { persistSession: false } });

  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) return 'Token invalide';

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: profile } = await admin.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'superadmin') return 'Accès superadmin requis';

  return null; // OK
}

// ── POST /api/admin/approve-business ─────────────────────────────────────────
export async function POST(req: NextRequest) {
  const authError = await requireSuperadmin(req);
  if (authError) return NextResponse.json({ error: authError }, { status: 403 });

  const url        = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  let body: {
    requestId: string;
    email:     string;
    password?: string;
    businessName: string;
    planId:    string;
    days:      number;
    note?:     string;
    planLabel?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });
  }

  const { requestId, email, businessName, planId, days, note, planLabel } = body;
  if (!requestId || !email || !businessName || !planId || !days) {
    return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 });
  }

  try {
    // 1. Créer l'utilisateur Auth
    const password = body.password ?? Math.random().toString(36).slice(-10) + 'A1!';
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (authError) throw new Error(authError.message);
    const userId = authData.user!.id;

    // 2. Créer le profil utilisateur
    const { error: userErr } = await admin.from('users').upsert({
      id: userId, email, full_name: businessName, role: 'owner',
    }, { onConflict: 'id' });
    if (userErr) throw new Error(userErr.message);

    // 3. Créer le business
    const { data: bizData, error: bizError } = await admin
      .from('businesses')
      .insert({ name: businessName, owner_id: userId, type: 'retail' })
      .select('id')
      .single();
    if (bizError) throw new Error(bizError.message);
    const businessId = bizData.id;

    // 4. Ajouter membre
    await admin.from('business_members').insert({ business_id: businessId, user_id: userId, role: 'owner' });
    await admin.from('users').update({ business_id: businessId }).eq('id', userId);

    // 5. Activer l'abonnement
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);
    await activateSubscription(businessId, planId, days, note);

    // 6. Marquer la demande comme approuvée
    await admin
      .from('public_subscription_requests')
      .update({ status: 'approved', processed_at: new Date().toISOString(), note: note ?? null })
      .eq('id', requestId);

    // 7. Email de confirmation
    sendEmail({
      type:    'subscription_approved',
      to:      email,
      subject: '✅ Votre accès ELM APP est activé',
      data: {
        business_name: businessName,
        email,
        password,
        plan_label:    planLabel ?? 'Pro',
        expires_at:    expiresAt.toISOString(),
      },
    }).catch(() => {});

    return NextResponse.json({ ok: true, businessId, userId });
  } catch (err) {
    console.error('[approve-business]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
