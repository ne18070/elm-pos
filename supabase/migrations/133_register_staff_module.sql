-- ============================================================================
-- Migration 133 : Enregistre "staff" (Équipe & Paie / RH) comme module
-- backoffice-configurable.
--
-- Le module RH (/staff : équipe, présences, paie, congés) est gated depuis
-- longtemps par `checkPermission()` via `feature: 'staff'` sur les clés
-- view_staff / manage_staff / manage_staff_attendance / manage_staff_payroll
-- (renderer/lib/permissions.ts) — hasFeature() exige que 'staff' soit présent
-- dans `businesses.features`. Mais 'staff' n'a jamais été enregistré comme
-- ligne dans `app_modules`, donc il n'apparaissait ni dans l'onglet Modules
-- du backoffice, ni dans la Matrice types×modules, ni dans le formulaire de
-- fonctionnalités des plans (backoffice/plans) : impossible de l'activer/
-- désactiver proprement pour une organisation donnée.
--
-- Purement additif — n'accorde 'staff' à AUCUN business_type par défaut
-- (même logique que le module 'tracking', migration 072) : chaque
-- organisation doit être activée manuellement via l'onglet Modules >
-- Matrice du backoffice, ou en l'ajoutant aux fonctionnalités d'un plan.
-- N'affecte donc le comportement d'aucun business existant.
-- ============================================================================

INSERT INTO public.app_modules (id, label, description, icon, is_core, is_active, sort_order)
VALUES ('staff', 'Équipe & Paie (RH)', 'Fiches employés, organigramme, documents, pointage, paie et congés', 'UsersRound', false, true, 30)
ON CONFLICT (id) DO UPDATE SET
  label       = EXCLUDED.label,
  description = EXCLUDED.description,
  icon        = EXCLUDED.icon,
  sort_order  = EXCLUDED.sort_order;
