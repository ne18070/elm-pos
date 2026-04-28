import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.elm-app.click').replace(/\/$/, '');
}

async function requireSuperadmin(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return 'Token manquant';

  const token = auth.slice(7);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const client = createClient(url, anon, { auth: { persistSession: false } });

  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) return 'Token invalide';

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: profile } = await admin.from('users').select('is_superadmin').eq('id', user.id).single();
  if (!profile?.is_superadmin) return 'Acces superadmin requis';

  return null;
}

async function sendActivationEmail(input: {
  supabaseUrl: string;
  authorization: string;
  to: string;
  fullName?: string;
  businessName: string;
  planLabel?: string;
  expiresAt: Date;
  activationUrl: string;
}) {
  const res = await fetch(`${input.supabaseUrl}/functions/v1/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': input.authorization },
    body: JSON.stringify({
      type: 'marketing',
      to: input.to,
      subject: 'Votre acces ELM APP est active',
      data: {
        title: 'Votre compte ELM APP est pret',
        content: [
          `Bonjour ${input.fullName || input.businessName},`,
          `Votre abonnement ${input.planLabel ?? 'Pro'} pour ${input.businessName} est active.`,
          'Cliquez sur le bouton ci-dessous pour choisir votre mot de passe et activer votre acces.',
          `Votre acces est valide jusqu'au ${input.expiresAt.toLocaleDateString('fr-FR')}.`,
        ].join('\n\n'),
        button_label: 'Activer mon compte',
        button_url: input.activationUrl,
      },
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Erreur envoi email (${res.status})`);
}

export async function POST(req: NextRequest) {
  const authError = await requireSuperadmin(req);
  if (authError) return NextResponse.json({ error: authError }, { status: 403 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  let body: {
    requestId: string;
    email: string;
    fullName?: string;
    businessName: string;
    denomination?: string;
    planId: string;
    days: number;
    note?: string;
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
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        redirectTo: `${siteUrl()}/reset-password?type=invite`,
        data: { full_name: fullName || businessName },
      },
    });
    if (linkError) throw new Error(linkError.message);

    const userId = linkData.user.id;
    const activationUrl = linkData.properties?.action_link;
    if (!activationUrl) throw new Error("Lien d'activation introuvable");

    const { error: userErr } = await admin.from('users').upsert({
      id: userId,
      email,
      full_name: fullName || businessName,
      role: 'owner',
    }, { onConflict: 'id' });
    if (userErr) throw new Error(userErr.message);

    const { data: orgData, error: orgError } = await admin
      .from('organizations')
      .insert({
        legal_name: denomination?.trim() || businessName,
        denomination: denomination?.trim() || null,
        owner_id: userId,
        currency: 'XOF',
      })
      .select('id')
      .single();
    if (orgError) throw new Error(orgError.message);

    const { data: bizData, error: bizError } = await admin
      .from('businesses')
      .insert({
        name: businessName,
        denomination: denomination || null,
        owner_id: userId,
        type: 'retail',
        organization_id: orgData.id,
      })
      .select('id')
      .single();
    if (bizError) throw new Error(bizError.message);

    const businessId = bizData.id;
    const { error: memberError } = await admin
      .from('business_members')
      .insert({ business_id: businessId, user_id: userId, role: 'owner' });
    if (memberError) throw new Error(memberError.message);

    const { error: businessUserError } = await admin.from('users').update({ business_id: businessId }).eq('id', userId);
    if (businessUserError) throw new Error(businessUserError.message);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);
    const { error: subError } = await admin.from('subscriptions').upsert({
      business_id: businessId,
      owner_id: userId,
      plan_id: planId,
      status: 'active',
      expires_at: expiresAt.toISOString(),
      activated_at: new Date().toISOString(),
      payment_note: note ?? null,
    }, { onConflict: 'owner_id' });
    if (subError) throw new Error(subError.message);

    const { error: requestError } = await admin
      .from('public_subscription_requests')
      .update({ status: 'approved', processed_at: new Date().toISOString(), note: note ?? null })
      .eq('id', requestId);
    if (requestError) throw new Error(requestError.message);

    await sendActivationEmail({
      supabaseUrl: url,
      authorization: req.headers.get('authorization') ?? '',
      to: email,
      fullName,
      businessName,
      planLabel,
      expiresAt,
      activationUrl,
    });

    return NextResponse.json({ ok: true, businessId, userId });
  } catch (err) {
    console.error('[approve-business]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
