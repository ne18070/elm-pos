import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireSuperadmin } from '@/lib/admin-auth';

export const runtime = 'nodejs';

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.elm-app.click').replace(/\/$/, '');
}

async function buildInvitationLink(admin: SupabaseClient, email: string): Promise<string> {
  // Tenter d'abord une invitation (crée l'utilisateur si absent)
  let { data, error } = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo: `${siteUrl()}/reset-password?type=invite` },
  });

  // Si l'invite échoue (utilisateur déjà confirmé ou autre), générer un lien recovery
  if (error) {
    const { data: recoveryData, error: recoveryError } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${siteUrl()}/reset-password?type=recovery` },
    });
    data  = recoveryData;
    error = recoveryError;
  }

  if (error) throw new Error(error.message);

  const link = data.properties?.action_link;
  if (!link) throw new Error("Lien d'activation introuvable");
  return link;
}

async function sendInvitationEmail(input: {
  supabaseUrl: string;
  authorization: string;
  to: string;
  businessName: string;
  planLabel?: string;
  activationUrl: string;
}) {
  const res = await fetch(`${input.supabaseUrl}/functions/v1/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': input.authorization },
    body: JSON.stringify({
      type: 'marketing',
      to: input.to,
      subject: 'Invitation a activer votre compte ELM APP',
      data: {
        title: 'Invitation ELM APP',
        content: [
          `Vous etes invite a activer le compte ${input.businessName} sur ELM APP.`,
          `Votre abonnement ${input.planLabel ?? 'Pro'} est active.`,
          'Cliquez sur le bouton ci-dessous pour choisir votre mot de passe et finaliser votre invitation.',
        ].join('\n\n'),
        button_label: 'Accepter l invitation',
        button_url: input.activationUrl,
      },
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Erreur envoi email (${res.status})`);
}

export async function POST(req: NextRequest) {
  const ctx = await requireSuperadmin(req);
  if ('response' in ctx) return ctx.response;
  const { admin } = ctx;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';

  const body = await req.json().catch(() => ({}));
  const bearerToken = req.headers.get('authorization') ?? '';

  if (body.email) {
    try {
      const activationUrl = await buildInvitationLink(admin, body.email);
      await sendInvitationEmail({
        supabaseUrl: url,
        authorization: bearerToken,
        to: body.email,
        businessName: body.business_name ?? '',
        planLabel: body.plan_label ?? 'Pro',
        activationUrl,
      });
      return NextResponse.json({ ok: true });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

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
    try {
      const activationUrl = await buildInvitationLink(admin, r.email);
      await sendInvitationEmail({
        supabaseUrl: url,
        authorization: bearerToken,
        to: r.email,
        businessName: r.business_name,
        planLabel: r.plan_label ?? 'Pro',
        activationUrl,
      });
      results.push({ email: r.email, ok: true });
    } catch (err) {
      results.push({ email: r.email, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ count: results.length, results });
}
