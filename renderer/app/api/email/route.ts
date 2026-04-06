import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = 'ELM APP <contact@elm-app.click>';

// ─── Email templates ──────────────────────────────────────────────────────────

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

function btn(href: string, label: string) {
  return `<a href="${href}" style="display:inline-block;background:#2563eb;color:#ffffff;font-size:15px;font-weight:700;padding:14px 32px;border-radius:12px;text-decoration:none;">${label}</a>`;
}

// ─── Templates par type ───────────────────────────────────────────────────────

const templates = {

  subscription_received: (data: { business_name: string; plan_label: string }) =>
    baseLayout(`
      <h2 style="color:#0f172a;font-size:22px;font-weight:800;margin:0 0 8px;">Demande reçue ✓</h2>
      <p style="color:#475569;font-size:15px;margin:0 0 24px;">
        Bonjour, nous avons bien reçu la demande d'abonnement pour <strong>${data.business_name}</strong> (plan <strong>${data.plan_label}</strong>).
      </p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:24px;">
        <p style="color:#475569;font-size:14px;margin:0;">
          Votre accès sera activé sous <strong style="color:#0f172a;">24 heures</strong> après vérification de votre paiement.
          Vous recevrez un second email avec vos identifiants de connexion.
        </p>
      </div>
      <p style="color:#94a3b8;font-size:13px;margin:0;">
        Des questions ? Répondez à cet email ou écrivez-nous à <a href="mailto:contact@elm-app.click" style="color:#2563eb;">contact@elm-app.click</a>.
      </p>
    `),

  subscription_approved: (data: { business_name: string; email: string; password: string; plan_label: string; expires_at?: string }) =>
    baseLayout(`
      <h2 style="color:#0f172a;font-size:22px;font-weight:800;margin:0 0 8px;">Accès activé 🎉</h2>
      <p style="color:#475569;font-size:15px;margin:0 0 24px;">
        Félicitations ! Votre abonnement <strong>${data.plan_label}</strong> pour <strong>${data.business_name}</strong> est maintenant actif.
        ${data.expires_at ? `Valide jusqu'au <strong>${new Date(data.expires_at).toLocaleDateString('fr-FR')}</strong>.` : ''}
      </p>
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:24px;margin-bottom:24px;">
        <p style="color:#15803d;font-size:13px;font-weight:700;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.05em;">Vos identifiants de connexion</p>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr>
            <td style="color:#475569;font-size:14px;padding:6px 0;width:100px;">Email</td>
            <td style="color:#0f172a;font-size:14px;font-weight:600;font-family:monospace;">${data.email}</td>
          </tr>
          <tr>
            <td style="color:#475569;font-size:14px;padding:6px 0;">Mot de passe</td>
            <td style="color:#0f172a;font-size:14px;font-weight:600;font-family:monospace;">${data.password}</td>
          </tr>
        </table>
      </div>
      <p style="text-align:center;margin:0 0 24px;">
        ${btn('https://elm-app.click/login', 'Accéder à mon espace →')}
      </p>
      <p style="color:#94a3b8;font-size:13px;margin:0;">
        Nous vous recommandons de changer votre mot de passe après votre première connexion.
      </p>
    `),

  subscription_rejected: (data: { business_name: string; note?: string }) =>
    baseLayout(`
      <h2 style="color:#0f172a;font-size:22px;font-weight:800;margin:0 0 8px;">Demande non approuvée</h2>
      <p style="color:#475569;font-size:15px;margin:0 0 24px;">
        Nous avons examiné votre demande pour <strong>${data.business_name}</strong> et ne sommes pas en mesure de l'approuver pour le moment.
      </p>
      ${data.note ? `
      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:20px;margin-bottom:24px;">
        <p style="color:#9a3412;font-size:13px;font-weight:700;margin:0 0 6px;">Motif</p>
        <p style="color:#7c2d12;font-size:14px;margin:0;">${data.note}</p>
      </div>` : ''}
      <p style="color:#475569;font-size:14px;margin:0 0 24px;">
        Si vous pensez qu'il s'agit d'une erreur ou souhaitez soumettre une nouvelle demande, contactez-nous.
      </p>
      <p style="text-align:center;margin:0 0 24px;">
        ${btn('mailto:contact@elm-app.click', 'Nous contacter')}
      </p>
    `),

} as const;

type EmailType = keyof typeof templates;

// ─── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { type: EmailType; to: string; subject: string; data: Record<string, unknown> };
    const { type, to, subject, data } = body;

    if (!type || !to || !subject) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const template = templates[type];
    if (!template) {
      return NextResponse.json({ error: `Unknown email type: ${type}` }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const html = (template as (d: any) => string)(data);

    const { data: result, error } = await resend.emails.send({ from: FROM, to, subject, html });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ id: result?.id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
