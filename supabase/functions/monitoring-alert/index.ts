import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SYSTEM_WA_PHONE_NUMBER_ID = Deno.env.get('SYSTEM_WA_PHONE_NUMBER_ID');
const SYSTEM_WA_ACCESS_TOKEN    = Deno.env.get('SYSTEM_WA_ACCESS_TOKEN');
const TECHNICAL_WA_NUMBER       = Deno.env.get('TECHNICAL_WA_NUMBER');
const SLACK_WEBHOOK_URL         = Deno.env.get('SLACK_WEBHOOK_URL');
const RESEND_API_KEY            = Deno.env.get('RESEND_API_KEY');
const ALERT_EMAIL_TO            = Deno.env.get('ALERT_EMAIL_TO');
const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// In-memory throttle: one alert per key per 5 minutes (single instance).
const recentAlerts = new Map<string, number>();
const THROTTLE_MS = 5 * 60 * 1000;

function shouldSend(key: string): boolean {
  const last = recentAlerts.get(key);
  if (last && Date.now() - last < THROTTLE_MS) return false;
  recentAlerts.set(key, Date.now());
  return true;
}

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const payload = await req.json();
    const { record, type } = payload;

    if (type !== 'INSERT') return new Response('Ignored', { status: 200 });
    if (record.level !== 'error' && record.level !== 'critical') return new Response('Ignored', { status: 200 });

    const throttleKey = `${record.category}:${record.message?.slice(0, 80)}`;
    if (!shouldSend(throttleKey)) {
      console.log('[Alert] Throttled:', throttleKey);
      return new Response('Throttled', { status: 200 });
    }

    // Determine channels: alert rules drive the routing, errors default to whatsapp.
    let channels: string[] = ['whatsapp'];
    if (record.level === 'critical' && record.category === 'alert') {
      const ruleCode = record.context?.rule;
      if (ruleCode) {
        const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const { data: rule } = await db
          .from('monitoring_alert_rules')
          .select('channels')
          .eq('code', ruleCode)
          .single();
        if (rule?.channels?.length) channels = rule.channels;
      }
    }

    const bizName    = record.business_id ? await getBusinessName(record.business_id) : null;
    const dakarTime  = new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Dakar' });
    const levelLabel = record.level === 'critical' ? 'CRITIQUE' : 'ERREUR';
    const levelEmoji = record.level === 'critical' ? '🚨' : '⚠️';

    const waMessage =
      `${levelEmoji} *ALERTE ELM PROD — ${levelLabel}*\n\n` +
      `*Catégorie :* ${(record.category ?? '?').toUpperCase()}\n` +
      `*Message :* ${record.message ?? 'Inconnue'}\n` +
      `*URL :* ${record.url ?? 'N/A'}\n` +
      (bizName ? `*Business :* ${bizName}\n` : '') +
      `*Heure :* ${dakarTime}\n\n` +
      `_Voir Backoffice > Vitals pour les détails._`;

    const results = await Promise.allSettled([
      channels.includes('whatsapp') ? sendWhatsApp(waMessage)                               : Promise.resolve(),
      channels.includes('slack')    ? sendSlack(record, bizName, dakarTime, levelLabel)     : Promise.resolve(),
      channels.includes('email')    ? sendEmail(record, bizName, dakarTime, levelLabel)     : Promise.resolve(),
    ]);

    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length > 0) {
      console.error('[Alert] Channel failures:', failures.map(f => (f as PromiseRejectedResult).reason));
    }

    return new Response(JSON.stringify({ success: true, channels, failures: failures.length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[Alert] Error:', err);
    return new Response('Error', { status: 500 });
  }
});

// ── Channel senders ────────────────────────────────────────────────────────────

async function sendWhatsApp(message: string): Promise<void> {
  if (!SYSTEM_WA_PHONE_NUMBER_ID || !SYSTEM_WA_ACCESS_TOKEN || !TECHNICAL_WA_NUMBER) {
    console.warn('[Alert/WA] Missing env vars — skipping');
    return;
  }
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${SYSTEM_WA_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${SYSTEM_WA_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type:    'individual',
        to:                TECHNICAL_WA_NUMBER,
        type:              'text',
        text:              { preview_url: false, body: message },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`WhatsApp API error: ${JSON.stringify(err)}`);
  }
}

async function sendSlack(
  record: Record<string, unknown>,
  bizName: string | null,
  dakarTime: string,
  levelLabel: string,
): Promise<void> {
  if (!SLACK_WEBHOOK_URL) {
    console.warn('[Alert/Slack] Missing SLACK_WEBHOOK_URL — skipping');
    return;
  }
  const color = record.level === 'critical' ? '#FF3B30' : '#FF9500';
  const body = {
    attachments: [{
      color,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `ELM PROD — ${levelLabel}` },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Catégorie*\n${String(record.category ?? '?').toUpperCase()}` },
            { type: 'mrkdwn', text: `*Message*\n${record.message ?? 'Inconnue'}` },
            { type: 'mrkdwn', text: `*URL*\n${record.url ?? 'N/A'}` },
            { type: 'mrkdwn', text: `*Business*\n${bizName ?? 'System'}` },
            { type: 'mrkdwn', text: `*Heure (Dakar)*\n${dakarTime}` },
          ],
        },
      ],
    }],
  };
  const res = await fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Slack webhook error: ${res.status}`);
}

async function sendEmail(
  record: Record<string, unknown>,
  bizName: string | null,
  dakarTime: string,
  levelLabel: string,
): Promise<void> {
  if (!RESEND_API_KEY || !ALERT_EMAIL_TO) {
    console.warn('[Alert/Email] Missing Resend config — skipping');
    return;
  }
  const subject = `[ELM PROD] ${levelLabel} — ${String(record.category ?? '?').toUpperCase()} : ${String(record.message ?? '').slice(0, 60)}`;
  const contextHtml = record.context
    ? `<tr><td style="padding:4px 8px;font-weight:bold">Contexte</td><td style="padding:4px 8px"><pre style="font-size:11px;margin:0">${JSON.stringify(record.context, null, 2)}</pre></td></tr>`
    : '';
  const html = `
    <h2 style="color:${record.level === 'critical' ? '#FF3B30' : '#FF9500'};font-family:sans-serif">
      🚨 ELM Production — ${levelLabel}
    </h2>
    <table border="0" cellpadding="0" cellspacing="0" style="font-family:monospace;border-collapse:collapse">
      <tr><td style="padding:4px 8px;font-weight:bold">Catégorie</td><td style="padding:4px 8px">${record.category ?? '?'}</td></tr>
      <tr><td style="padding:4px 8px;font-weight:bold">Message</td><td style="padding:4px 8px">${record.message ?? 'Inconnue'}</td></tr>
      <tr><td style="padding:4px 8px;font-weight:bold">URL</td><td style="padding:4px 8px">${record.url ?? 'N/A'}</td></tr>
      ${bizName ? `<tr><td style="padding:4px 8px;font-weight:bold">Business</td><td style="padding:4px 8px">${bizName}</td></tr>` : ''}
      <tr><td style="padding:4px 8px;font-weight:bold">Heure (Dakar)</td><td style="padding:4px 8px">${dakarTime}</td></tr>
      ${contextHtml}
    </table>
    <p style="color:#666;font-size:12px;margin-top:24px;font-family:sans-serif">
      Voir <a href="https://www.elm-app.click/backoffice">Backoffice &gt; Vitals</a> pour les détails.
    </p>
  `;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'ELM Monitoring <alerts@elm-app.click>',
      to:   [ALERT_EMAIL_TO],
      subject,
      html,
    }),
  });
  if (!res.ok) throw new Error(`Resend error: ${res.status}`);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function getBusinessName(businessId: string): Promise<string | null> {
  try {
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data } = await db.from('businesses').select('name').eq('id', businessId).single();
    return data?.name ?? null;
  } catch {
    return null;
  }
}
