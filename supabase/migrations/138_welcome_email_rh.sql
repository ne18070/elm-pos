-- ============================================================================
-- Migration 138 : Email de bienvenue dédié au secteur "RH / SIRH uniquement"
--
-- supabase/functions/welcome-email/index.ts résout le template à partir de
-- `industry_sector` : pour restaurant/juridique/location/hotel il utilise
-- `welcome_${sector}` (seedés en 046_sector_specific_welcome_templates.sql),
-- sinon il retombe sur le template générique 'welcome' — qui parle de
-- "configurer votre boutique", "enregistrer vos ventes" et "suivre vos
-- stocks". Pour une organisation créée via le secteur 'rh' (aucune caisse,
-- aucun stock), ce contenu n'a aucun sens.
--
-- Cette migration ajoute le template 'welcome_rh' ; la fonction Edge doit
-- être redéployée séparément (`supabase functions deploy welcome-email`)
-- avec 'rh' ajouté à la liste des secteurs mappés — modification faite dans
-- le même commit (supabase/functions/welcome-email/index.ts).
-- ============================================================================

INSERT INTO email_templates (key, name, description, variables, html_body) VALUES (
  'welcome_rh',
  'Bienvenue ! (RH / SIRH)',
  'Email de bienvenue pour les organisations utilisant uniquement le module RH.',
  '["full_name"]',
  '<h2 style="color:#0f172a;font-size:24px;font-weight:800;margin:0 0 12px;text-align:center;">Bienvenue ! 👥</h2>
<p style="color:#475569;font-size:16px;line-height:1.6;margin:0 0 24px;text-align:center;">
  Ravis de vous accueillir, <strong>{{full_name}}</strong>. ELM APP est prêt à simplifier la gestion de votre équipe.
</p>
<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:32px;margin-bottom:32px;">
  <p style="color:#1e293b;font-size:15px;font-weight:700;margin:0 0 16px;text-transform:uppercase;letter-spacing:0.025em;">Vos premiers pas RH :</p>
  <ul style="margin:0;padding:0;list-style:none;">
    <li style="color:#475569;font-size:14px;margin-bottom:12px;display:flex;align-items:center;">
      <span style="color:#2563eb;margin-right:12px;">✓</span> Ajoutez vos employés et leurs contrats
    </li>
    <li style="color:#475569;font-size:14px;margin-bottom:12px;display:flex;align-items:center;">
      <span style="color:#2563eb;margin-right:12px;">✓</span> Suivez les présences et lancez votre première paie
    </li>
    <li style="color:#475569;font-size:14px;margin-bottom:0;display:flex;align-items:center;">
      <span style="color:#2563eb;margin-right:12px;">✓</span> Gérez les congés en libre-service pour votre équipe
    </li>
  </ul>
</div>
<p style="text-align:center;margin:0 0 32px;">
  <a href="https://elm-app.click/login" style="display:inline-block;background:#2563eb;color:#ffffff;font-size:15px;font-weight:700;padding:16px 40px;border-radius:12px;text-decoration:none;">Accéder à mon espace RH</a>
</p>'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  variables = EXCLUDED.variables,
  html_body = EXCLUDED.html_body;
