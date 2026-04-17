-- Email templates stored in DB instead of hardcoded in code.
-- Variables use {{variable_name}} syntax; route does string substitution.
-- Conditional blocks (note_block, validity_text, button_block) are computed
-- by the route and injected as pre-rendered HTML strings.

CREATE TABLE email_templates (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  key          text        UNIQUE NOT NULL,
  name         text        NOT NULL,
  description  text,
  html_body    text        NOT NULL,
  variables    jsonb       DEFAULT '[]'::jsonb,
  is_active    boolean     DEFAULT true,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION _set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

-- ─── Seed: subscription_received ─────────────────────────────────────────────

INSERT INTO email_templates (key, name, description, variables, html_body) VALUES (
  'subscription_received',
  'Demande d''abonnement reçue',
  'Envoyé au client après soumission d''une demande d''abonnement.',
  '["business_name", "plan_label"]',
  '<h2 style="color:#0f172a;font-size:22px;font-weight:800;margin:0 0 8px;">Demande reçue ✓</h2>
<p style="color:#475569;font-size:15px;margin:0 0 24px;">
  Bonjour, nous avons bien reçu la demande d''abonnement pour <strong>{{business_name}}</strong> (plan <strong>{{plan_label}}</strong>).
</p>
<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:24px;">
  <p style="color:#475569;font-size:14px;margin:0;">
    Votre accès sera activé sous <strong style="color:#0f172a;">24 heures</strong> après vérification de votre paiement.
    Vous recevrez un second email avec vos identifiants de connexion.
  </p>
</div>
<p style="color:#94a3b8;font-size:13px;margin:0;">
  Des questions ? Répondez à cet email ou écrivez-nous à <a href="mailto:contact@elm-app.click" style="color:#2563eb;">contact@elm-app.click</a>.
</p>'
);

-- ─── Seed: subscription_approved ─────────────────────────────────────────────

INSERT INTO email_templates (key, name, description, variables, html_body) VALUES (
  'subscription_approved',
  'Abonnement activé',
  'Envoyé quand un abonnement est approuvé. validity_text est vide ou "Valide jusqu''au <date>".',
  '["business_name", "plan_label", "email", "password", "validity_text"]',
  '<h2 style="color:#0f172a;font-size:22px;font-weight:800;margin:0 0 8px;">Accès activé 🎉</h2>
<p style="color:#475569;font-size:15px;margin:0 0 24px;">
  Félicitations ! Votre abonnement <strong>{{plan_label}}</strong> pour <strong>{{business_name}}</strong> est maintenant actif.
  {{validity_text}}
</p>
<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:24px;margin-bottom:24px;">
  <p style="color:#15803d;font-size:13px;font-weight:700;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.05em;">Vos identifiants de connexion</p>
  <table cellpadding="0" cellspacing="0" style="width:100%;">
    <tr>
      <td style="color:#475569;font-size:14px;padding:6px 0;width:100px;">Email</td>
      <td style="color:#0f172a;font-size:14px;font-weight:600;font-family:monospace;">{{email}}</td>
    </tr>
    <tr>
      <td style="color:#475569;font-size:14px;padding:6px 0;">Mot de passe</td>
      <td style="color:#0f172a;font-size:14px;font-weight:600;font-family:monospace;">{{password}}</td>
    </tr>
  </table>
</div>
<p style="text-align:center;margin:0 0 24px;">
  <a href="https://elm-app.click/login" style="display:inline-block;background:#2563eb;color:#ffffff;font-size:15px;font-weight:700;padding:14px 32px;border-radius:12px;text-decoration:none;">Accéder à mon espace →</a>
</p>
<p style="color:#94a3b8;font-size:13px;margin:0;">
  Nous vous recommandons de changer votre mot de passe après votre première connexion.
</p>'
);

-- ─── Seed: subscription_rejected ─────────────────────────────────────────────

INSERT INTO email_templates (key, name, description, variables, html_body) VALUES (
  'subscription_rejected',
  'Demande refusée',
  'Envoyé quand une demande est refusée. note_block est vide ou un bloc HTML avec le motif.',
  '["business_name", "note_block"]',
  '<h2 style="color:#0f172a;font-size:22px;font-weight:800;margin:0 0 8px;">Demande non approuvée</h2>
<p style="color:#475569;font-size:15px;margin:0 0 24px;">
  Nous avons examiné votre demande pour <strong>{{business_name}}</strong> et ne sommes pas en mesure de l''approuver pour le moment.
</p>
{{note_block}}
<p style="color:#475569;font-size:14px;margin:0 0 24px;">
  Si vous pensez qu''il s''agit d''une erreur ou souhaitez soumettre une nouvelle demande, contactez-nous.
</p>
<p style="text-align:center;margin:0 0 24px;">
  <a href="mailto:contact@elm-app.click" style="display:inline-block;background:#2563eb;color:#ffffff;font-size:15px;font-weight:700;padding:14px 32px;border-radius:12px;text-decoration:none;">Nous contacter</a>
</p>'
);

-- ─── Seed: marketing ─────────────────────────────────────────────────────────

INSERT INTO email_templates (key, name, description, variables, html_body) VALUES (
  'marketing',
  'Email marketing',
  'Template générique pour les campagnes. button_block est vide ou un bouton CTA complet.',
  '["title", "content", "button_block"]',
  '<h2 style="color:#0f172a;font-size:22px;font-weight:800;margin:0 0 16px;">{{title}}</h2>
<div style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px;white-space:pre-wrap;">{{content}}</div>
{{button_block}}
<p style="color:#94a3b8;font-size:13px;margin:32px 0 0;border-top:1px solid #f1f5f9;padding-top:24px;">
  Vous recevez cet email car vous êtes utilisateur de ELM APP.
</p>'
);
