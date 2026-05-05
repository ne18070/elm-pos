-- Migration: 045_welcome_email_template.sql
-- Description: Ajout du template d'email de bienvenue avec design premium

INSERT INTO email_templates (key, name, description, variables, html_body) VALUES (
  'welcome',
  'Bienvenue sur ELM APP',
  'Envoyé automatiquement aux nouveaux utilisateurs après leur inscription.',
  '["full_name"]',
  '<h2 style="color:#0f172a;font-size:24px;font-weight:800;margin:0 0 12px;text-align:center;">Bienvenue dans l''aventure ! 👋</h2>
<p style="color:#475569;font-size:16px;line-height:1.6;margin:0 0 24px;text-align:center;">
  Ravis de vous accueillir, <strong>{{full_name}}</strong>. Votre compte ELM APP est prêt et n''attend que vous.
</p>
<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:32px;margin-bottom:32px;">
  <p style="color:#1e293b;font-size:15px;font-weight:700;margin:0 0 16px;text-transform:uppercase;letter-spacing:0.025em;">Ce que vous pouvez faire dès maintenant :</p>
  <ul style="margin:0;padding:0;list-style:none;">
    <li style="color:#475569;font-size:14px;margin-bottom:12px;display:flex;align-items:center;">
      <span style="color:#2563eb;margin-right:12px;">✓</span> Configurez votre boutique et vos produits
    </li>
    <li style="color:#475569;font-size:14px;margin-bottom:12px;display:flex;align-items:center;">
      <span style="color:#2563eb;margin-right:12px;">✓</span> Enregistrez vos premières ventes en quelques clics
    </li>
    <li style="color:#475569;font-size:14px;margin-bottom:0;display:flex;align-items:center;">
      <span style="color:#2563eb;margin-right:12px;">✓</span> Suivez vos stocks et vos dépenses en temps réel
    </li>
  </ul>
</div>
<p style="text-align:center;margin:0 0 32px;">
  <a href="https://elm-app.click/login" style="display:inline-block;background:#2563eb;color:#ffffff;font-size:15px;font-weight:700;padding:16px 40px;border-radius:12px;text-decoration:none;box-shadow:0 4px 6px -1px rgba(37,99,235,0.2);">Accéder à mon tableau de bord</a>
</p>
<p style="color:#94a3b8;font-size:13px;line-height:1.5;text-align:center;margin:0;padding-top:24px;border-top:1px solid #f1f5f9;">
  Vous avez des questions ? Notre équipe est là pour vous accompagner.<br/>
  Répondez simplement à cet email ou visitez notre centre d''aide.
</p>'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  variables = EXCLUDED.variables,
  html_body = EXCLUDED.html_body;
