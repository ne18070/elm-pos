-- ============================================================================
-- Migration 139 : Enregistre 'rh' dans la table business_types
--
-- 137_rh_business_type.sql a ajouté 'rh' comme valeur de businesses.type
-- (contrainte CHECK) et à NAV_BY_TYPE côté renderer — mais pas à la table
-- `business_types`, un catalogue séparé (backoffice-configurable, cf.
-- 001_core_and_auth.sql / 079_education_module.sql) utilisé par :
--   - renderer/app/(dashboard)/configure/page.tsx pour afficher le type
--     assigné à un business ("Type d'établissement") ;
--   - le backoffice ModulesTab (onglets Types & Matrice) pour piloter les
--     modules par défaut par type.
-- Sans cette ligne, une organisation RH-only afficherait "Aucun type
-- assigné" sur /configure et n'apparaîtrait pas dans la Matrice.
-- ============================================================================

INSERT INTO public.business_types (id, label, description, icon, accent_color, sort_order)
VALUES (
  'rh',
  'RH / SIRH',
  'Organisations utilisant uniquement le module RH — équipe, présences, paie et congés, sans caisse ni stock',
  'UsersRound',
  'green',
  6
)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon;

-- Lie le type 'rh' au module 'staff' par défaut : contrairement aux autres
-- types (où 'staff' reste volontairement optionnel, cf. 133), une
-- organisation 'rh' existe uniquement pour ce module — c'est déjà le
-- comportement de create_business_v2 (features := ARRAY['staff']).
INSERT INTO public.business_type_modules (business_type_id, module_id, is_default)
VALUES ('rh', 'staff', true)
ON CONFLICT (business_type_id, module_id) DO UPDATE SET is_default = EXCLUDED.is_default;
