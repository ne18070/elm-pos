import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireSuperadmin } from '@/lib/admin-auth';

export const runtime = 'nodejs';

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.elm-app.click').replace(/\/$/, '');
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

type Created = { userId?: string; orgId?: string; businessId?: string; invoiceId?: string };

// Annule ce qui a été créé pour qu'un nouvel essai reparte d'un état propre
// (sinon generateLink('invite') refuse l'email, désormais déjà enregistré).
async function rollback(admin: SupabaseClient, c: Created) {
  if (c.invoiceId) await admin.from('subscription_invoices').delete().eq('id', c.invoiceId);
  if (c.businessId) {
    await admin.from('subscriptions').delete().eq('business_id', c.businessId);
    await admin.from('business_members').delete().eq('business_id', c.businessId);
    if (c.userId) await admin.from('users').update({ business_id: null }).eq('id', c.userId);
    await admin.from('businesses').delete().eq('id', c.businessId);
  }
  if (c.orgId) await admin.from('organizations').delete().eq('id', c.orgId);
  if (c.userId) {
    await admin.from('users').delete().eq('id', c.userId);
    await admin.auth.admin.deleteUser(c.userId);
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireSuperadmin(req);
  if ('response' in ctx) return ctx.response;
  const { admin } = ctx;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';

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
  if (!Number.isInteger(days) || days < 1 || days > 3660) {
    return NextResponse.json({ error: 'Durée invalide' }, { status: 400 });
  }

  const { data: request, error: requestFetchError } = await admin
    .from('public_subscription_requests').select('status').eq('id', requestId).maybeSingle();
  if (requestFetchError) return NextResponse.json({ error: requestFetchError.message }, { status: 500 });
  if (!request) return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 });
  if (request.status !== 'pending') {
    return NextResponse.json({ error: 'Cette demande a déjà été traitée' }, { status: 409 });
  }

  const created: Created = {};
  let activationUrl: string;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);

  try {
    // Create user via invite to get a userId
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
    created.userId = userId;

    // Confirm email so we can generate a recovery link (works with implicit flow,
    // no PKCE verifier needed — same mechanism used by resend-approvals)
    const { error: confirmError } = await admin.auth.admin.updateUserById(userId, {
      email_confirm: true,
    });
    if (confirmError) throw new Error(confirmError.message);

    // Recovery links redirect with hash tokens (implicit flow), not a PKCE code,
    // so the client can establish a session without a locally-stored code verifier
    const { data: recoveryData, error: recoveryError } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${siteUrl()}/reset-password?type=invite` },
    });
    if (recoveryError) throw new Error(recoveryError.message);

    const link = recoveryData.properties?.action_link;
    if (!link) throw new Error("Lien d'activation introuvable");
    activationUrl = link;

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
    created.orgId = orgData.id;

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
    created.businessId = businessId;
    const { error: memberError } = await admin
      .from('business_members')
      .insert({ business_id: businessId, user_id: userId, role: 'owner' });
    if (memberError) throw new Error(memberError.message);

    const { error: businessUserError } = await admin.from('users').update({ business_id: businessId }).eq('id', userId);
    if (businessUserError) throw new Error(businessUserError.message);

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

    const { data: invoiceId, error: invoiceError } = await admin.rpc('create_subscription_invoice', {
      p_business_id: businessId,
      p_owner_id:    userId,
      p_plan_id:     planId,
      p_days:        days,
      p_note:        note ?? undefined,
      p_source:      'signup',
    });
    if (invoiceError) throw new Error(invoiceError.message);
    created.invoiceId = invoiceId ?? undefined;

    const { error: requestError } = await admin
      .from('public_subscription_requests')
      .update({ status: 'approved', processed_at: new Date().toISOString(), note: note ?? null })
      .eq('id', requestId);
    if (requestError) throw new Error(requestError.message);
  } catch (err) {
    console.error('[approve-business]', err);
    await rollback(admin, created).catch((e) => console.error('[approve-business] rollback', e));
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  // Le compte est créé : un échec d'envoi ne doit pas tout annuler. Le bouton
  // « Renvoyer l'email d'accès » de /backoffice/demandes permet de réessayer.
  let emailError: string | undefined;
  try {
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
  } catch (err) {
    emailError = err instanceof Error ? err.message : String(err);
    console.error('[approve-business] email', err);
  }

  return NextResponse.json({ ok: true, businessId: created.businessId, userId: created.userId, emailError });
}
