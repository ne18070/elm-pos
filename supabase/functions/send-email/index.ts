import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

const FROM_EMAIL = 'ELM APP <contact@elm-app.click>';
const PUBLIC_EMAIL_TYPES = ['subscription_received'];
const PUBLIC_SITE_URL = (Deno.env.get('PUBLIC_SITE_URL') || Deno.env.get('APP_URL') || 'https://www.elm-app.click').replace(/\/$/, '');
const LOGO_URL = `${PUBLIC_SITE_URL}/logo.png`;

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
        <tr><td style="background:#0a0f1e;border-radius:16px 16px 0 0;padding:28px 40px;text-align:center;">
          <img src="${LOGO_URL}" width="96" height="96" alt="ELM APP" style="display:block;width:96px;height:96px;object-fit:contain;margin:0 auto 12px;" />
          <div style="color:#ffffff;font-size:20px;font-weight:800;line-height:1;">
            ELM <span style="color:#38bdf8;">APP</span>
          </div>
        </td></tr>
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

function buildVars(type: string, data: Record<string, any>): Record<string, string> {
  const str = (v: any) => (v != null ? String(v) : '');
  const base = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, escapeHtml(str(v))]));

  if (type === 'subscription_approved') {
    const expiresAt = data.expires_at;
    return {
      ...base,
      validity_text: expiresAt
        ? `Valide jusqu'au <strong>${new Date(expiresAt).toLocaleDateString('fr-FR')}</strong>.`
        : '',
    };
  }

  if (type === 'subscription_rejected') {
    const note = data.note;
    return {
      ...base,
      note_block: note
        ? `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:20px;margin-bottom:24px;"><p style="color:#9a3412;font-size:13px;font-weight:700;margin:0 0 6px;">Motif</p><p style="color:#7c2d12;font-size:14px;margin:0;">${escapeHtml(note)}</p></div>`
        : '',
    };
  }

  if (type === 'marketing') {
    const btnLabel = data.button_label;
    const btnUrl = data.button_url;
    const safeUrl = btnUrl && /^https?:\/\//.test(btnUrl) ? btnUrl : '';
    const content = str(data.content)
      .split(/\n{2,}/)
      .map((part) => `<p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">${escapeHtml(part).replace(/\n/g, '<br/>')}</p>`)
      .join('');
    return {
      ...base,
      content,
      button_block: btnLabel && safeUrl
        ? `<p style="text-align:center;margin:32px 0 24px;"><a href="${escapeHtml(safeUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;font-size:15px;font-weight:700;padding:14px 32px;border-radius:12px;text-decoration:none;">${escapeHtml(btnLabel)}</a></p>`
        : '',
    };
  }

  return base;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
  }

  try {
    const { type, to, subject, data } = await req.json();

    if (!type || !to || !subject) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
    }

    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader && !PUBLIC_EMAIL_TYPES.includes(type)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    if (authHeader) {
      const authClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
      const { data: { user }, error: authError } = await authClient.auth.getUser(authHeader.replace('Bearer ', ''));
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401 });
      }
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    const { data: tpl, error: tplError } = await supabase
      .from('email_templates')
      .select('html_body')
      .eq('key', type)
      .eq('is_active', true)
      .single();

    if (tplError || !tpl) {
      return new Response(JSON.stringify({ error: `Template introuvable: ${type}` }), { status: 400 });
    }

    const vars = buildVars(type, data);
    const html = baseLayout(renderTemplate(tpl.html_body, vars));

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
    });

    const result = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: result.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ id: result.id }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
