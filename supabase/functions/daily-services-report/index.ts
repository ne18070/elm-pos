import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY          = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL            = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET             = Deno.env.get('CRON_SECRET') ?? '';
const APP_URL                 = (Deno.env.get('PUBLIC_SITE_URL') || 'https://app.elm-app.click').replace(/\/$/, '');
const LOGO_URL                = `${APP_URL}/logo.png`;
const FROM                    = 'ELM APP <contact@elm-app.click>';

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(d: Date): string {
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtDateShort(d: Date): string {
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtAmount(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency, maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n) + ' ' + currency;
  }
}

function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Email HTML builder ──────────────────────────────────────────────────────

const COL_HEAD = `
  padding: 9px 14px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #64748b;
  background: #f8fafc;
  border-bottom: 2px solid #e2e8f0;
  text-align: left;
  white-space: nowrap;
`;
const COL_CELL = `
  padding: 9px 14px;
  font-size: 13px;
  color: #334155;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: top;
`;

function tableRow(cells: string[], isHeader = false): string {
  const tag   = isHeader ? 'th' : 'td';
  const style = isHeader ? COL_HEAD : COL_CELL;
  return `<tr>${cells.map(c => `<${tag} style="${style}">${c}</${tag}>`).join('')}</tr>`;
}

interface EnCours  { order_number: number; client_name: string | null; subject_ref: string | null; started_at: string | null; total: number; }
interface NonPaye  { order_number: number; client_name: string | null; subject_ref: string | null; finished_at: string | null; total: number; paid_amount: number; }

function buildEmailHtml(params: {
  ownerName:    string;
  businessName: string;
  yDate:        string;
  enCours:      EnCours[];
  nonPaye:      NonPaye[];
  currency:     string;
}): string {
  const { ownerName, businessName, yDate, enCours, nonPaye, currency } = params;
  const yesterday  = new Date(yDate + 'T12:00:00Z');
  const firstName  = esc(ownerName.split(' ')[0] || ownerName);
  const fmt        = (n: number) => esc(fmtAmount(n, currency));
  const totalReste = nonPaye.reduce((s, o) => s + (o.total - (o.paid_amount ?? 0)), 0);

  // ── En cours table ──────────────────────────────────────────────────────────
  let enCoursHtml = '';
  if (enCours.length > 0) {
    const rows = [
      tableRow(['N° OT', 'Client', 'Objet', 'Débuté le', 'Montant'], true),
      ...enCours.map(o => tableRow([
        `<b style="color:#0f172a;">#${o.order_number}</b>`,
        o.client_name
          ? esc(o.client_name)
          : `<span style="color:#94a3b8;font-style:italic;">—</span>`,
        o.subject_ref
          ? `<span style="color:#64748b;">${esc(o.subject_ref)}</span>`
          : `<span style="color:#cbd5e1;">—</span>`,
        `<span style="color:#64748b;">${fmtTime(o.started_at)}</span>`,
        fmt(o.total),
      ])),
    ];

    enCoursHtml = `
      <div style="margin-bottom:28px;">
        <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#b45309;">
          ⏳ &nbsp;${enCours.length} prestation${enCours.length > 1 ? 's' : ''} en cours
        </p>
        <table width="100%" cellpadding="0" cellspacing="0"
          style="border-collapse:collapse;border:1px solid #fde68a;border-radius:10px;overflow:hidden;font-family:inherit;">
          ${rows.join('')}
        </table>
      </div>`;
  }

  // ── Non encaissé table ──────────────────────────────────────────────────────
  let nonPayeHtml = '';
  if (nonPaye.length > 0) {
    const rows = [
      tableRow(['N° OT', 'Client', 'Objet', 'Terminé le', 'Reste dû'], true),
      ...nonPaye.map(o => {
        const reste = o.total - (o.paid_amount ?? 0);
        return tableRow([
          `<b style="color:#0f172a;">#${o.order_number}</b>`,
          o.client_name
            ? esc(o.client_name)
            : `<span style="color:#94a3b8;font-style:italic;">—</span>`,
          o.subject_ref
            ? `<span style="color:#64748b;">${esc(o.subject_ref)}</span>`
            : `<span style="color:#cbd5e1;">—</span>`,
          `<span style="color:#64748b;">${fmtTime(o.finished_at)}</span>`,
          `<b style="color:#dc2626;">${fmt(reste)}</b>`,
        ]);
      }),
    ];

    nonPayeHtml = `
      <div style="margin-bottom:28px;">
        <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#b91c1c;">
          💳 &nbsp;${nonPaye.length} prestation${nonPaye.length > 1 ? 's' : ''} non encaissée${nonPaye.length > 1 ? 's' : ''}
        </p>
        <table width="100%" cellpadding="0" cellspacing="0"
          style="border-collapse:collapse;border:1px solid #fecaca;border-radius:10px;overflow:hidden;font-family:inherit;">
          ${rows.join('')}
        </table>
      </div>`;
  }

  // ── Total restant ───────────────────────────────────────────────────────────
  const totalBlock = nonPaye.length > 0 ? `
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 20px;margin-bottom:28px;display:flex;align-items:center;gap:16px;">
      <div>
        <p style="margin:0 0 2px;font-size:11px;color:#991b1b;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Total non encaissé</p>
        <p style="margin:0;font-size:22px;font-weight:800;color:#7f1d1d;">${fmt(totalReste)}</p>
      </div>
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

      <!-- Header -->
      <tr><td style="background:#0a0f1e;border-radius:14px 14px 0 0;padding:22px 36px;text-align:center;">
        <img src="${LOGO_URL}" width="56" height="56" alt="ELM APP"
          style="display:block;width:56px;height:56px;object-fit:contain;margin:0 auto 8px;" />
        <div style="color:#ffffff;font-size:15px;font-weight:800;letter-spacing:0.06em;">
          ELM <span style="color:#38bdf8;">APP</span>
        </div>
        <div style="color:#64748b;font-size:11px;margin-top:3px;letter-spacing:0.04em;">
          Rapport quotidien · Prestations
        </div>
      </td></tr>

      <!-- Body -->
      <tr><td style="background:#ffffff;padding:36px;border-radius:0 0 14px 14px;">

        <p style="font-size:15px;color:#0f172a;font-weight:600;margin:0 0 4px;">Bonjour ${firstName},</p>
        <p style="font-size:13px;color:#64748b;margin:0 0 28px;line-height:1.65;">
          Voici le récapitulatif des prestations du
          <strong style="color:#0f172a;">${esc(fmtDate(yesterday))}</strong>
          qui nécessitent votre suivi.
        </p>

        ${enCoursHtml}
        ${nonPayeHtml}
        ${totalBlock}

        <p style="text-align:center;margin:32px 0 10px;">
          <a href="${APP_URL}/services"
            style="display:inline-block;background:#2563eb;color:#ffffff;font-size:13px;font-weight:700;
                   padding:13px 32px;border-radius:10px;text-decoration:none;letter-spacing:0.02em;">
            Accéder aux prestations &rarr;
          </a>
        </p>
        <p style="text-align:center;margin:0 0 28px;">
          <span style="font-size:11px;color:#94a3b8;">${esc(businessName)}</span>
        </p>

        <hr style="border:none;border-top:1px solid #f1f5f9;margin:24px 0 18px;" />
        <p style="color:#94a3b8;font-size:11px;text-align:center;margin:0;line-height:1.7;">
          ELM APP · Gestion simplifiée pour l'Afrique<br/>
          Vous recevez cet e-mail en tant que propriétaire du compte.<br/>
          <a href="mailto:contact@elm-app.click" style="color:#94a3b8;text-decoration:none;">contact@elm-app.click</a>
        </p>

      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
  }

  // Simple shared-secret check so only the pg_cron job can trigger this
  if (CRON_SECRET) {
    const auth = req.headers.get('Authorization') ?? '';
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  try {
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Build yesterday UTC range
    const now       = new Date();
    const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
    const yDate     = yesterday.toISOString().slice(0, 10);
    const yStart    = `${yDate}T00:00:00.000Z`;
    const yEnd      = `${yDate}T23:59:59.999Z`;

    // Fetch all owner memberships
    const { data: memberships, error: mErr } = await db
      .from('business_members')
      .select('business_id, user_id')
      .eq('role', 'owner');

    if (mErr) throw new Error(mErr.message);
    if (!memberships?.length) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no owners' }), { status: 200 });
    }

    let sent = 0;
    const errors: string[] = [];

    for (const m of memberships) {
      try {
        const [{ data: owner }, { data: business }] = await Promise.all([
          db.from('users').select('email, full_name').eq('id', m.user_id).single(),
          db.from('businesses').select('name, currency').eq('id', m.business_id).single(),
        ]);

        if (!owner?.email || !business) continue;

        const [{ data: enCours }, { data: nonPaye }] = await Promise.all([
          // En cours started yesterday and still running
          db.from('service_orders')
            .select('order_number, client_name, subject_ref, started_at, total')
            .eq('business_id', m.business_id)
            .eq('status', 'en_cours')
            .gte('started_at', yStart)
            .lte('started_at', yEnd)
            .order('order_number'),

          // Terminé yesterday, not fully paid
          db.from('service_orders')
            .select('order_number, client_name, subject_ref, finished_at, total, paid_amount')
            .eq('business_id', m.business_id)
            .eq('status', 'termine')
            .gte('finished_at', yStart)
            .lte('finished_at', yEnd)
            .order('order_number'),
        ]);

        if (!enCours?.length && !nonPaye?.length) continue;

        const html = buildEmailHtml({
          ownerName:    owner.full_name ?? 'Propriétaire',
          businessName: business.name,
          yDate,
          enCours:  (enCours  ?? []) as EnCours[],
          nonPaye:  (nonPaye  ?? []) as NonPaye[],
          currency: business.currency ?? 'XOF',
        });

        const subject = `Rapport du ${fmtDateShort(yesterday)} — ${business.name}`;

        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: FROM, to: owner.email, subject, html }),
        });

        if (res.ok) {
          sent++;
        } else {
          const body = await res.json();
          errors.push(`${owner.email}: ${body?.message ?? res.status}`);
        }
      } catch (e) {
        errors.push(String(e));
      }
    }

    return new Response(JSON.stringify({ sent, errors }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
