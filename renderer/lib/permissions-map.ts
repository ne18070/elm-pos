import type { UserRole } from '@pos-types';

// -- Permission keys -----------------------------------------------------------

export type PermissionKey =
  // -- Navigation screens ------------------------------------------------------
  | 'view_pos'
  | 'view_cash_session'
  | 'view_livraisons'
  | 'view_livreurs'
  | 'view_orders'
  | 'view_clients'
  | 'view_products'
  | 'view_approvisionnement'
  | 'view_revendeurs'
  | 'view_hotel'
  | 'view_categories'
  | 'view_coupons'
  | 'view_analytics'
  | 'view_depenses'
  | 'view_comptabilite'
  | 'view_activity'
  | 'view_recovery'
  | 'view_dossiers'
  | 'view_honoraires'
  | 'view_contrats'
  | 'view_voitures'
  | 'view_staff'
  | 'view_team_tracking'
  | 'view_menu_du_jour'
  | 'view_whatsapp'
  | 'view_settings'
  // -- Action permissions -------------------------------------------------------
  | 'view_financials'
  | 'manage_team'
  | 'manage_settings'
  | 'cancel_orders'
  | 'manage_rooms'
  | 'manage_expenses'
  | 'delete_data'
  // -- Legal action permissions ------------------------------------------------
  | 'create_dossier'
  | 'edit_dossier'
  | 'manage_workflows'
  | 'launch_workflow'
  | 'add_fee'
  | 'manage_legal_config'
  | 'archive_dossier';

export type PermissionGroup = 'navigation' | 'finance' | 'gestion' | 'admin';

export interface PermissionMeta {
  label:        string;
  group:        PermissionGroup;
  defaultRoles: readonly UserRole[];
  feature?:     string; // Feature required to enable this permission
}

// -- Permissions table ---------------------------------------------------------
// defaultRoles: roles that have this permission by default (and above via hasRole).
// The highest defaultRole determines the minimum role required.

export const PERMISSIONS: Record<PermissionKey, PermissionMeta> = {
  // Navigation
  view_pos:               { label: 'Accès caisse (POS)',           group: 'navigation', defaultRoles: ['staff', 'manager', 'admin', 'owner'], feature: 'retail' },
  view_cash_session:      { label: 'Clôture caisse',               group: 'navigation', defaultRoles: ['manager', 'admin', 'owner'], feature: 'retail' },
  view_orders:            { label: 'Commandes',                    group: 'navigation', defaultRoles: ['staff', 'manager', 'admin', 'owner'], feature: 'retail' },
  view_livraisons:        { label: 'Livraisons',                   group: 'navigation', defaultRoles: ['staff', 'manager', 'admin', 'owner'], feature: 'delivery' },
  view_livreurs:          { label: 'Gestion des livreurs',         group: 'navigation', defaultRoles: ['manager', 'admin', 'owner'], feature: 'delivery' },
  view_clients:           { label: 'Clients',                      group: 'navigation', defaultRoles: ['manager', 'admin', 'owner'], feature: 'retail' },
  view_products:          { label: 'Produits',                     group: 'navigation', defaultRoles: ['manager', 'admin', 'owner'], feature: 'retail' },
  view_approvisionnement: { label: 'Approvisionnement',            group: 'navigation', defaultRoles: ['manager', 'admin', 'owner'], feature: 'stock' },
  view_revendeurs:        { label: 'Revendeurs',                   group: 'navigation', defaultRoles: ['admin', 'owner'], feature: 'retail' },
  view_hotel:             { label: 'Hôtel',                        group: 'navigation', defaultRoles: ['staff', 'manager', 'admin', 'owner'], feature: 'hotel' },
  view_categories:        { label: 'Catégories',                   group: 'navigation', defaultRoles: ['manager', 'admin', 'owner'], feature: 'retail' },
  view_coupons:           { label: 'Coupons',                      group: 'navigation', defaultRoles: ['manager', 'admin', 'owner'], feature: 'retail' },
  view_analytics:         { label: 'Statistiques',                 group: 'finance',    defaultRoles: ['manager', 'admin', 'owner'] },
  view_depenses:          { label: 'Dépenses',                     group: 'finance',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'expenses' },
  view_comptabilite:      { label: 'Comptabilité',                 group: 'finance',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'comptabilite' },
  view_activity:          { label: 'Journal d\'activité',          group: 'admin',      defaultRoles: ['manager', 'admin', 'owner'] },
  view_recovery:          { label: 'Récupération de données',      group: 'admin',      defaultRoles: ['admin', 'owner'] },
  view_dossiers:          { label: 'Dossiers & Affaires',          group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'dossiers' },
  view_honoraires:        { label: 'Honoraires',                   group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'honoraires' },

  view_contrats:          { label: 'Contrats & Location',          group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'rental' },
  view_voitures:          { label: 'Vente de Voitures',            group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'voitures' },
  view_staff:             { label: 'Personnel & Paie',             group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'staff' },
  view_team_tracking:     { label: 'Tracking terrain',             group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'tracking' },
  view_menu_du_jour:      { label: 'Menu du jour',                 group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'restaurant' },
  view_whatsapp:          { label: 'WhatsApp',                     group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'whatsapp' },
  view_settings:          { label: 'Paramètres',                   group: 'admin',      defaultRoles: ['staff', 'manager', 'admin', 'owner'] },

  // Actions
  view_financials:        { label: 'Voir les données financières', group: 'finance',    defaultRoles: ['admin', 'owner'] },
  manage_team:            { label: 'Gérer l\'équipe',              group: 'admin',      defaultRoles: ['admin', 'owner'] },
  manage_settings:        { label: 'Modifier les paramètres',      group: 'admin',      defaultRoles: ['manager', 'admin', 'owner'] },
  cancel_orders:          { label: 'Annuler des commandes',        group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'retail' },
  manage_rooms:           { label: 'Gérer les chambres',           group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'hotel' },
  manage_expenses:        { label: 'Enregistrer des dépenses',     group: 'finance',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'expenses' },
  delete_data:            { label: 'Supprimer des données',        group: 'admin',      defaultRoles: ['admin', 'owner'] },

  // Actions Juridiques (Dossiers)
  create_dossier:         { label: 'Créer de nouveaux dossiers',    group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'dossiers' },
  edit_dossier:           { label: 'Modifier les dossiers',         group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'dossiers' },
  manage_workflows:       { label: 'Gérer les modèles de processus', group: 'gestion',    defaultRoles: ['admin', 'owner'],             feature: 'dossiers' },
  launch_workflow:        { label: 'Lancer un processus',           group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'dossiers' },
  add_fee:                { label: 'Ajouter des honoraires',        group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'honoraires' },
  archive_dossier:        { label: 'Archiver des dossiers',         group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'dossiers' },
  manage_legal_config:    { label: 'Configurer le cabinet (Tribunaux...)', group: 'admin', defaultRoles: ['admin', 'owner'],         feature: 'dossiers' },
};

// Permissions that owners always have and cannot be overridden
export const IMMUTABLE_OWNER_PERMISSIONS: readonly PermissionKey[] = [
  'manage_team',
  'delete_data',
  'view_recovery',
  'view_financials',
];

export const PERMISSION_GROUPS: Record<PermissionGroup, string> = {
  navigation: 'Navigation',
  finance:    'Finance & Stats',
  gestion:    'Gestion',
  admin:      'Administration',
};
