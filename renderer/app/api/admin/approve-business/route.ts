import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
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
  const { data: profile } = await admin.from('users').select('is_superadmin').eq('id', user.id).single();
  if (!profile?.is_superadmin) return 'Accès superadmin requis';

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
    fullName?: string;
    businessName: string;
    denomination?: string;
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

  const { requestId, email, fullName, businessName, denomination, planId, days, note, planLabel } = body;
  if (!requestId || !email || !businessName || !planId || !days) {
    return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 });
  }

  try {
    // 1. Inviter l'utilisateur (Ceci crée l'utilisateur dans auth.users et envoie l'email d'invitation)
    // L'email contiendra un lien vers /reset-password avec un access_token
    const { data: authData, error: authError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.elm-app.click'}/reset-password`,
      data: {
        full_name: fullName || businessName,
      }
    });
    
    if (authError) throw new Error(authError.message);
    const userId = authData.user!.id;

    // 2. Créer le profil utilisateur
    const { error: userErr } = await admin.from('users').upsert({
      id: userId, email, full_name: fullName || businessName, role: 'owner',
    }, { onConflict: 'id' });
    if (userErr) throw new Error(userErr.message);

    // 3. Créer l'organization (entité légale)
    const { data: orgData, error: orgError } = await admin
      .from('organizations')
      .insert({
        legal_name:   denomination?.trim() || businessName,
        denomination: denomination?.trim() || null,
        owner_id:     userId,
        currency:     'XOF',
      })
      .select('id')
      .single();
    if (orgError) throw new Error(orgError.message);
    const organizationId = orgData.id;

    // 4. Créer le business (établissement) lié à l'org
    const { data: bizData, error: bizError } = await admin
      .from('businesses')
      .insert({
        name:            businessName,
        denomination:    denomination || null,
        owner_id:        userId,
        type:            'retail',
        organization_id: organizationId,
      })
      .select('id')
      .single();
    if (bizError) throw new Error(bizError.message);
    const businessId = bizData.id;

    // 5. Ajouter membre
    await admin.from('business_members').insert({ business_id: businessId, user_id: userId, role: 'owner' });
    await admin.from('users').update({ business_id: businessId }).eq('id', userId);

    // 6. Activer l'abonnement
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);
    const { error: subError } = await admin.from('subscriptions').upsert({
      business_id:  businessId,
      owner_id:     userId,
      plan_id:      planId,
      status:       'active',
      expires_at:   expiresAt.toISOString(),
      activated_at: new Date().toISOString(),
      payment_note: note ?? null,
    }, { onConflict: 'owner_id' });
    if (subError) throw new Error(subError.message);

    // 7. Marquer la demande comme approuvée
    await admin
      .from('public_subscription_requests')
      .update({ status: 'approved', processed_at: new Date().toISOString(), note: note ?? null })
      .eq('id', requestId);

    return NextResponse.json({ ok: true, businessId, userId });
  } catch (err) {
    console.error('[approve-business]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
