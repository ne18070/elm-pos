-- ============================================================================
-- Migration 173 : Couverture complète des emails de bienvenue par secteur
--
-- supabase/functions/welcome-email/index.ts résout le template à partir de
-- `industry_sector` choisi à l'onboarding (boutique, restaurant, location,
-- juridique, hotel, education, rh, autre). Deux trous :
--
--   1. boutique/retail → la fonction envoie type 'welcome_retail'… qui n'a
--      jamais été seedé. send-email répond 400 « Template introuvable » :
--      les commerçants (le secteur le plus courant) ne reçoivent AUCUN email.
--   2. education → retombe sur le template générique 'welcome', dont le
--      contenu parle de « boutique », « ventes » et « stocks » — hors sujet
--      pour une école.
--
-- Cette migration seed 'welcome_retail' et 'welcome_education', et rend le
-- template générique 'welcome' (secteur 'autre' + fallback) neutre, sans
-- vocabulaire boutique. La fonction Edge doit être redéployée séparément
-- (`supabase functions deploy welcome-email`) avec 'education' ajouté à la
-- liste des secteurs mappés — modification faite dans le même commit
-- (supabase/functions/welcome-email/index.ts).
-- ============================================================================

-- 1. Boutique / Retail (reprend le contenu boutique de l'ancien générique)
INSERT INTO email_templates (key, name, description, variables, html_body) VALUES (
  'welcome_retail',
  'Bienvenue ! (Boutique / Retail)',
  'Email de bienvenue pour les boutiques et commerces de détail.',
  '["full_name"]',
  '<h2 style="color:#0f172a;font-size:24px;font-weight:800;margin:0 0 12px;text-align:center;">Bienvenue ! 🛍️</h2>
<p style="color:#475569;font-size:16px;line-height:1.6;margin:0 0 24px;text-align:center;">
  Ravis de vous accueillir, <strong>{{full_name}}</strong>. Votre caisse ELM APP est prête et n''attend que vous.
</p>
<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:32px;margin-bottom:32px;">
  <p style="color:#1e293b;font-size:15px;font-weight:700;margin:0 0 16px;text-transform:uppercase;letter-spacing:0.025em;">Lancez votre boutique :</p>
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
  <a href="https://elm-app.click/login" style="display:inline-block;background:#2563eb;color:#ffffff;font-size:15px;font-weight:700;padding:16px 40px;border-radius:12px;text-decoration:none;">Ouvrir ma caisse</a>
</p>'
) ON CONFLICT (key) DO UPDATE SET html_body = EXCLUDED.html_body;

-- 2. Éducation / École
INSERT INTO email_templates (key, name, description, variables, html_body) VALUES (
  'welcome_education',
  'Bienvenue ! (Éducation / École)',
  'Email de bienvenue pour les établissements scolaires.',
  '["full_name"]',
  '<h2 style="color:#0f172a;font-size:24px;font-weight:800;margin:0 0 12px;text-align:center;">Bienvenue ! 🎓</h2>
<p style="color:#475569;font-size:16px;line-height:1.6;margin:0 0 24px;text-align:center;">
  Ravis de vous accueillir, <strong>{{full_name}}</strong>. ELM APP simplifie la gestion de votre établissement.
</p>
<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:32px;margin-bottom:32px;">
  <p style="color:#1e293b;font-size:15px;font-weight:700;margin:0 0 16px;text-transform:uppercase;letter-spacing:0.025em;">Préparez votre rentrée :</p>
  <ul style="margin:0;padding:0;list-style:none;">
    <li style="color:#475569;font-size:14px;margin-bottom:12px;display:flex;align-items:center;">
      <span style="color:#2563eb;margin-right:12px;">✓</span> Créez vos classes et inscrivez vos élèves
    </li>
    <li style="color:#475569;font-size:14px;margin-bottom:12px;display:flex;align-items:center;">
      <span style="color:#2563eb;margin-right:12px;">✓</span> Configurez la scolarité et encaissez les premiers frais
    </li>
    <li style="color:#475569;font-size:14px;margin-bottom:0;display:flex;align-items:center;">
      <span style="color:#2563eb;margin-right:12px;">✓</span> Saisissez les notes et éditez les bulletins
    </li>
  </ul>
</div>
<p style="text-align:center;margin:0 0 32px;">
  <a href="https://elm-app.click/login" style="display:inline-block;background:#2563eb;color:#ffffff;font-size:15px;font-weight:700;padding:16px 40px;border-radius:12px;text-decoration:none;">Accéder à mon établissement</a>
</p>'
) ON CONFLICT (key) DO UPDATE SET html_body = EXCLUDED.html_body;

-- 3. Template générique 'welcome' (secteur « autre » + fallback) : contenu
--    neutre, sans vocabulaire boutique/ventes/stocks.
UPDATE email_templates SET
  description = 'Email de bienvenue générique (secteur « autre » ou non mappé).',
  html_body = '<h2 style="color:#0f172a;font-size:24px;font-weight:800;margin:0 0 12px;text-align:center;">Bienvenue dans l''aventure ! 👋</h2>
<p style="color:#475569;font-size:16px;line-height:1.6;margin:0 0 24px;text-align:center;">
  Ravis de vous accueillir, <strong>{{full_name}}</strong>. Votre compte ELM APP est prêt et n''attend que vous.
</p>
<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:32px;margin-bottom:32px;">
  <p style="color:#1e293b;font-size:15px;font-weight:700;margin:0 0 16px;text-transform:uppercase;letter-spacing:0.025em;">Ce que vous pouvez faire dès maintenant :</p>
  <ul style="margin:0;padding:0;list-style:none;">
    <li style="color:#475569;font-size:14px;margin-bottom:12px;display:flex;align-items:center;">
      <span style="color:#2563eb;margin-right:12px;">✓</span> Configurez votre espace et votre catalogue de produits ou services
    </li>
    <li style="color:#475569;font-size:14px;margin-bottom:12px;display:flex;align-items:center;">
      <span style="color:#2563eb;margin-right:12px;">✓</span> Enregistrez vos premières opérations en quelques clics
    </li>
    <li style="color:#475569;font-size:14px;margin-bottom:0;display:flex;align-items:center;">
      <span style="color:#2563eb;margin-right:12px;">✓</span> Suivez votre activité et vos finances en temps réel
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
WHERE key = 'welcome';
