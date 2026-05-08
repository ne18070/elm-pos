-- Migration: 046_sector_specific_welcome_templates.sql
-- Description: Ajout de templates de bienvenue spécifiques par secteur

-- 1. Restaurant
INSERT INTO email_templates (key, name, description, variables, html_body) VALUES (
  'welcome_restaurant',
  'Bienvenue Chef ! (Restaurant)',
  'Email de bienvenue pour les restaurateurs.',
  '["full_name"]',
  '<h2 style="color:#0f172a;font-size:24px;font-weight:800;margin:0 0 12px;text-align:center;">Bienvenue Chef ! 👨‍🍳</h2>
<p style="color:#475569;font-size:16px;line-height:1.6;margin:0 0 24px;text-align:center;">
  Ravis de vous accueillir, <strong>{{full_name}}</strong>. ELM APP est prêt à vous aider pour votre prochain service.
</p>
<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:32px;margin-bottom:32px;">
  <p style="color:#1e293b;font-size:15px;font-weight:700;margin:0 0 16px;text-transform:uppercase;letter-spacing:0.025em;">Préparez votre ouverture :</p>
  <ul style="margin:0;padding:0;list-style:none;">
    <li style="color:#475569;font-size:14px;margin-bottom:12px;display:flex;align-items:center;">
      <span style="color:#2563eb;margin-right:12px;">✓</span> Configurez votre menu et vos catégories
    </li>
    <li style="color:#475569;font-size:14px;margin-bottom:12px;display:flex;align-items:center;">
      <span style="color:#2563eb;margin-right:12px;">✓</span> Gérez vos tables et vos réservations
    </li>
    <li style="color:#475569;font-size:14px;margin-bottom:0;display:flex;align-items:center;">
      <span style="color:#2563eb;margin-right:12px;">✓</span> Suivez vos ventes et vos stocks en temps réel
    </li>
  </ul>
</div>
<p style="text-align:center;margin:0 0 32px;">
  <a href="https://elm-app.click/login" style="display:inline-block;background:#2563eb;color:#ffffff;font-size:15px;font-weight:700;padding:16px 40px;border-radius:12px;text-decoration:none;">Accéder à ma cuisine</a>
</p>'
) ON CONFLICT (key) DO UPDATE SET html_body = EXCLUDED.html_body;

-- 2. Juridique
INSERT INTO email_templates (key, name, description, variables, html_body) VALUES (
  'welcome_juridique',
  'Bienvenue Maître ! (Juridique)',
  'Email de bienvenue pour les cabinets d''avocats.',
  '["full_name"]',
  '<h2 style="color:#0f172a;font-size:24px;font-weight:800;margin:0 0 12px;text-align:center;">Bienvenue Maître ! ⚖️</h2>
<p style="color:#475569;font-size:16px;line-height:1.6;margin:0 0 24px;text-align:center;">
  Ravis de vous accueillir, <strong>{{full_name}}</strong>. ELM APP devient votre allié pour la gestion de votre cabinet.
</p>
<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:32px;margin-bottom:32px;">
  <p style="color:#1e293b;font-size:15px;font-weight:700;margin:0 0 16px;text-transform:uppercase;letter-spacing:0.025em;">Vos premiers pas au cabinet :</p>
  <ul style="margin:0;padding:0;list-style:none;">
    <li style="color:#475569;font-size:14px;margin-bottom:12px;display:flex;align-items:center;">
      <span style="color:#2563eb;margin-right:12px;">✓</span> Importez vos dossiers clients
    </li>
    <li style="color:#475569;font-size:14px;margin-bottom:12px;display:flex;align-items:center;">
      <span style="color:#2563eb;margin-right:12px;">✓</span> Configurez vos modèles de procédures
    </li>
    <li style="color:#475569;font-size:14px;margin-bottom:0;display:flex;align-items:center;">
      <span style="color:#2563eb;margin-right:12px;">✓</span> Suivez vos honoraires et vos temps passés
    </li>
  </ul>
</div>
<p style="text-align:center;margin:0 0 32px;">
  <a href="https://elm-app.click/login" style="display:inline-block;background:#2563eb;color:#ffffff;font-size:15px;font-weight:700;padding:16px 40px;border-radius:12px;text-decoration:none;">Accéder à mes dossiers</a>
</p>'
) ON CONFLICT (key) DO UPDATE SET html_body = EXCLUDED.html_body;

-- 3. Location
INSERT INTO email_templates (key, name, description, variables, html_body) VALUES (
  'welcome_location',
  'Bienvenue ! (Location)',
  'Email de bienvenue pour les agences de location.',
  '["full_name"]',
  '<h2 style="color:#0f172a;font-size:24px;font-weight:800;margin:0 0 12px;text-align:center;">Bienvenue ! 🚗</h2>
<p style="color:#475569;font-size:16px;line-height:1.6;margin:0 0 24px;text-align:center;">
  Ravis de vous accueillir, <strong>{{full_name}}</strong>. ELM APP simplifie la gestion de votre flotte.
</p>
<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:32px;margin-bottom:32px;">
  <p style="color:#1e293b;font-size:15px;font-weight:700;margin:0 0 16px;text-transform:uppercase;letter-spacing:0.025em;">Préparez vos véhicules :</p>
  <ul style="margin:0;padding:0;list-style:none;">
    <li style="color:#475569;font-size:14px;margin-bottom:12px;display:flex;align-items:center;">
      <span style="color:#2563eb;margin-right:12px;">✓</span> Enregistrez votre parc automobile
    </li>
    <li style="color:#475569;font-size:14px;margin-bottom:12px;display:flex;align-items:center;">
      <span style="color:#2563eb;margin-right:12px;">✓</span> Créez vos modèles de contrats de location
    </li>
    <li style="color:#475569;font-size:14px;margin-bottom:0;display:flex;align-items:center;">
      <span style="color:#2563eb;margin-right:12px;">✓</span> Suivez les paiements et les retours
    </li>
  </ul>
</div>
<p style="text-align:center;margin:0 0 32px;">
  <a href="https://elm-app.click/login" style="display:inline-block;background:#2563eb;color:#ffffff;font-size:15px;font-weight:700;padding:16px 40px;border-radius:12px;text-decoration:none;">Gérer ma flotte</a>
</p>'
) ON CONFLICT (key) DO UPDATE SET html_body = EXCLUDED.html_body;

-- 4. Hôtel
INSERT INTO email_templates (key, name, description, variables, html_body) VALUES (
  'welcome_hotel',
  'Bienvenue ! (Hôtel)',
  'Email de bienvenue pour les hôtels.',
  '["full_name"]',
  '<h2 style="color:#0f172a;font-size:24px;font-weight:800;margin:0 0 12px;text-align:center;">Bienvenue ! 🏨</h2>
<p style="color:#475569;font-size:16px;line-height:1.6;margin:0 0 24px;text-align:center;">
  Ravis de vous accueillir, <strong>{{full_name}}</strong>. ELM APP optimise la gestion de vos chambres.
</p>
<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:32px;margin-bottom:32px;">
  <p style="color:#1e293b;font-size:15px;font-weight:700;margin:0 0 16px;text-transform:uppercase;letter-spacing:0.025em;">Prêt pour le check-in :</p>
  <ul style="margin:0;padding:0;list-style:none;">
    <li style="color:#475569;font-size:14px;margin-bottom:12px;display:flex;align-items:center;">
      <span style="color:#2563eb;margin-right:12px;">✓</span> Configurez vos types de chambres
    </li>
    <li style="color:#475569;font-size:14px;margin-bottom:12px;display:flex;align-items:center;">
      <span style="color:#2563eb;margin-right:12px;">✓</span> Suivez le planning des réservations
    </li>
    <li style="color:#475569;font-size:14px;margin-bottom:0;display:flex;align-items:center;">
      <span style="color:#2563eb;margin-right:12px;">✓</span> Gérez les consommations et prestations
    </li>
  </ul>
</div>
<p style="text-align:center;margin:0 0 32px;">
  <a href="https://elm-app.click/login" style="display:inline-block;background:#2563eb;color:#ffffff;font-size:15px;font-weight:700;padding:16px 40px;border-radius:12px;text-decoration:none;">Voir mon planning</a>
</p>'
) ON CONFLICT (key) DO UPDATE SET html_body = EXCLUDED.html_body;
