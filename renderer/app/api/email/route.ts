import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@services/supabase/database.types';

// Types that can be sent without authentication (public flows)
const PUBLIC_EMAIL_TYPES = ['subscription_received'] as const;

const FROM = 'ELM APP <contact@elm-app.click>';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}

function baseLayout(content: string) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ELM APP</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">

        <!-- Header -->
        <tr><td style="background:#0a0f1e;border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;">
          <div style="display:inline-flex;align-items:center;gap:10px;">
            <div style="width:36px;height:36px;background:#2563eb;border-radius:10px;display:inline-block;vertical-align:middle;"></div>
            <span style="color:#ffffff;font-size:20px;font-weight:800;vertical-align:middle;margin-left:8px;">
              ELM <span style="color:#38bdf8;">APP</span>
            </span>
          </div>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#ffffff;padding:40px;border-radius:0 0 16px 16px;">
          ${content}
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0;" />
          <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0;">
            ELM APP · Gestion simplifiée pour l'Afrique<br/>
            <a href="mailto:contact@elm-app.click" style="color:#2563eb;">contact@elm-app.click</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function renderTemplate(html: string, vars: Record<string, string>): string {
  return html.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function buildVars(type: string, data: Record<string, unknown>): Record<string, string> {
  const str = (v: unknown) => (v != null ? String(v) : '');
  const base = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, escapeHtml(str(v))]));

  if (type === 'subscription_approved') {
    const expiresAt = data.expires_at as string | undefined;
    return {
      ...base,
      validity_text: expiresAt
        ? `Valide jusqu'au <strong>${new Date(expiresAt).toLocaleDateString('fr-FR')}</strong>.`
        : '',
    };
  }

  if (type === 'subscription_rejected') {
    const note = data.note as string | undefined;
    return {
      ...base,
      note_block: note
        ? `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:20px;margin-bottom:24px;"><p style="color:#9a3412;font-size:13px;font-weight:700;margin:0 0 6px;">Motif</p><p style="color:#7c2d12;font-size:14px;margin:0;">${escapeHtml(note)}</p></div>`
        : '',
    };
  }

  if (type === 'marketing') {
    const btnLabel = data.button_label as string | undefined;
    const btnUrl = data.button_url as string | undefined;
    // Only allow http/https URLs to prevent javascript: injection
    const safeUrl = btnUrl && /^https?:\/\//.test(btnUrl) ? btnUrl : '';
    return {
      ...base,
      button_block:
        btnLabel && safeUrl
          ? `<p style="text-align:center;margin:32px 0 24px;"><a href="${escapeHtml(safeUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;font-size:15px;font-weight:700;padding:14px 32px;border-radius:12px;text-decoration:none;">${escapeHtml(btnLabel)}</a></p>`
          : '',
    };
  }

  return base;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { type: string; to: string; subject: string; data: Record<string, unknown> };
    const { type, to, subject, data } = body;

    if (!type || !to || !subject) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Auth check: authenticated users can send any type; unauthenticated only public types
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (token) {
      const anonClient = createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
        { auth: { persistSession: false } }
      );
      const { error: authError } = await anonClient.auth.getUser(token);
      if (authError) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    } else if (!(PUBLIC_EMAIL_TYPES as readonly string[]).includes(type)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getServiceClient();
    const { data: tpl, error: tplError } = await supabase
      .from('email_templates')
      .select('html_body')
      .eq('key', type)
      .eq('is_active', true)
      .single();

    if (tplError || !tpl) {
      return NextResponse.json({ error: `Template introuvable: ${type}` }, { status: 400 });
    }

    const vars = buildVars(type, data);
    const html = baseLayout(renderTemplate(tpl.html_body, vars));

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data: result, error } = await resend.emails.send({ from: FROM, to, subject, html });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ id: result?.id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
