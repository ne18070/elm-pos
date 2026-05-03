import type { UserRole } from '@pos-types';

export type PermissionGroup = 'navigation' | 'finance' | 'gestion' | 'admin';

export interface PermissionMeta {
  label:        string;
  group:        PermissionGroup;
  defaultRoles: readonly UserRole[];
  feature?:     string | readonly string[];
}

export const PERMISSIONS = {
  // -- Navigation (Pages)
  view_pos:               { label: 'Accès caisse (POS)',           group: 'navigation', defaultRoles: ['staff', 'manager', 'admin', 'owner'], feature: ['pos', 'caisse', 'retail'] },
  view_cash_session:      { label: 'Accès gestion de caisse',       group: 'navigation', defaultRoles: ['manager', 'admin', 'owner'], feature: ['caisse', 'retail'] },
  view_orders:            { label: 'Accès commandes/ventes',       group: 'navigation', defaultRoles: ['staff', 'manager', 'admin', 'owner'], feature: ['pos', 'caisse', 'retail'] },
  view_services:          { label: 'Accès prestations service',    group: 'navigation', defaultRoles: ['staff', 'manager', 'admin', 'owner'], feature: 'service' },
  view_livraisons:        { label: 'Accès suivi livraisons',       group: 'navigation', defaultRoles: ['staff', 'manager', 'admin', 'owner'], feature: ['livraison', 'delivery'] },
  view_livreurs:          { label: 'Accès gestion livreurs',       group: 'navigation', defaultRoles: ['manager', 'admin', 'owner'], feature: ['livraison', 'delivery'] },
  view_clients:           { label: 'Accès base clients',           group: 'navigation', defaultRoles: ['manager', 'admin', 'owner'] },
  view_products:          { label: 'Accès catalogue produits',     group: 'navigation', defaultRoles: ['manager', 'admin', 'owner'], feature: ['stock', 'retail'] },
  view_approvisionnement: { label: 'Accès stocks/entrées',         group: 'navigation', defaultRoles: ['manager', 'admin', 'owner'], feature: ['approvisionnement', 'stock'] },
  view_revendeurs:        { label: 'Accès réseau revendeurs',      group: 'navigation', defaultRoles: ['admin', 'owner'], feature: ['revendeurs', 'retail'] },
  view_hotel:             { label: 'Accès module hôtel',           group: 'navigation', defaultRoles: ['staff', 'manager', 'admin', 'owner'], feature: 'hotel' },
  view_categories:        { label: 'Accès catégories produits',    group: 'navigation', defaultRoles: ['manager', 'admin', 'owner'], feature: ['stock', 'retail'] },
  view_coupons:           { label: 'Accès coupons/remises',        group: 'navigation', defaultRoles: ['manager', 'admin', 'owner'], feature: ['coupons', 'retail'] },
  view_analytics:         { label: 'Accès statistiques (CA)',       group: 'finance',    defaultRoles: ['manager', 'admin', 'owner'] },
  view_depenses:          { label: 'Accès suivi dépenses',         group: 'finance',    defaultRoles: ['manager', 'admin', 'owner'], feature: ['expenses', 'comptabilite'] },
  view_comptabilite:      { label: 'Accès états comptables',       group: 'finance',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'comptabilite' },
  view_activity:          { label: 'Accès journal audit',          group: 'admin',      defaultRoles: ['manager', 'admin', 'owner'] },
  view_recovery:          { label: 'Accès récupération données',   group: 'admin',      defaultRoles: ['admin', 'owner'] },
  view_dossiers:          { label: 'Accès dossiers juridiques',    group: 'navigation', defaultRoles: ['manager', 'admin', 'owner'], feature: 'dossiers' },
  view_honoraires:        { label: 'Accès facturation honoraires', group: 'finance',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'honoraires' },
  view_contrats:          { label: 'Accès contrats location',      group: 'navigation', defaultRoles: ['manager', 'admin', 'owner'], feature: 'contrats' },
  view_voitures:          { label: 'Accès vente voitures',         group: 'navigation', defaultRoles: ['manager', 'admin', 'owner'], feature: 'voitures' },
  view_staff:             { label: 'Accès personnel & RH',         group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'staff' },
  view_team_tracking:     { label: 'Accès tracking équipe',        group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'tracking' },
  view_menu_du_jour:      { label: 'Accès menu du jour',           group: 'navigation', defaultRoles: ['manager', 'admin', 'owner'], feature: 'restaurant' },
  view_whatsapp:          { label: 'Accès support WhatsApp',       group: 'navigation', defaultRoles: ['manager', 'admin', 'owner'], feature: 'whatsapp' },
  view_settings:          { label: 'Accès paramètres',              group: 'admin',      defaultRoles: ['staff', 'manager', 'admin', 'owner'] },

  // -- Actions Générales
  manage_cash_session:    { label: 'Ouvrir/Clôturer la caisse',      group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: ['caisse', 'retail'] },
  view_financials:        { label: 'Voir marges & bénéfices',      group: 'finance',    defaultRoles: ['admin', 'owner'] },
  manage_team:            { label: 'Gérer l\'équipe (inviter/rôles)', group: 'admin',      defaultRoles: ['admin', 'owner'] },
  manage_settings:        { label: 'Modifier config business',     group: 'admin',      defaultRoles: ['manager', 'admin', 'owner'] },
  cancel_orders:          { label: 'Annuler des commandes/ventes',  group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'retail' },
  manage_expenses:        { label: 'Enregistrer des dépenses',     group: 'finance',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'expenses' },
  delete_expense:         { label: 'Supprimer des dépenses',       group: 'admin',      defaultRoles: ['admin', 'owner'],             feature: 'expenses' },
  delete_data:            { label: 'Supprimer données critiques',   group: 'admin',      defaultRoles: ['admin', 'owner'] },

  // -- Prestations de Service
  create_service_order:   { label: 'Créer ordres de travail',      group: 'gestion',    defaultRoles: ['staff', 'manager', 'admin', 'owner'], feature: 'service' },
  edit_service_order:     { label: 'Modifier ordres de travail',   group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'service' },
  update_service_status:  { label: 'Changer statut prestations',  group: 'gestion',    defaultRoles: ['staff', 'manager', 'admin', 'owner'], feature: 'service' },
  collect_service_payment:{ label: 'Encaisser les prestations',     group: 'finance',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'service' },
  share_service_order:    { label: 'Partager reçus prestation',    group: 'gestion',    defaultRoles: ['staff', 'manager', 'admin', 'owner'], feature: 'service' },
  cancel_service_order:   { label: 'Annuler ordres de travail',    group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'service' },
  manage_service_catalog: { label: 'Gérer catalogue prestations', group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'service' },

  // -- CRM / Catalogue
  create_client:          { label: 'Ajouter des clients',           group: 'gestion',    defaultRoles: ['staff', 'manager', 'admin', 'owner'] },
  edit_client:            { label: 'Modifier les clients',          group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'] },
  delete_client:          { label: 'Supprimer des clients',         group: 'admin',      defaultRoles: ['admin', 'owner'] },
  import_clients:         { label: 'Importer des clients (CSV)',    group: 'admin',      defaultRoles: ['admin', 'owner'] },
  export_clients:         { label: 'Exporter la base clients',      group: 'admin',      defaultRoles: ['admin', 'owner'] },
  create_product:         { label: 'Ajouter des produits',          group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: ['stock', 'retail'] },
  edit_product:           { label: 'Modifier les produits',         group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: ['stock', 'retail'] },
  delete_product:         { label: 'Supprimer des produits',        group: 'admin',      defaultRoles: ['admin', 'owner'],             feature: ['stock', 'retail'] },
  import_products:        { label: 'Importer des produits (CSV)',   group: 'admin',      defaultRoles: ['admin', 'owner'],             feature: ['stock', 'retail'] },
  export_products:        { label: 'Exporter catalogue produits',  group: 'admin',      defaultRoles: ['admin', 'owner'],             feature: ['stock', 'retail'] },
  print_barcodes:         { label: 'Imprimer des codes-barres',     group: 'gestion',    defaultRoles: ['staff', 'manager', 'admin', 'owner'], feature: ['stock', 'retail'] },
  share_shop:             { label: 'Partager le lien boutique',     group: 'gestion',    defaultRoles: ['staff', 'manager', 'admin', 'owner'], feature: 'retail' },
  manage_inventory:       { label: 'Gérer les stocks (entrées)',    group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: ['approvisionnement', 'stock'] },
  create_category:        { label: 'Ajouter des catégories',        group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: ['stock', 'retail'] },
  edit_category:          { label: 'Modifier les catégories',       group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: ['stock', 'retail'] },
  delete_category:        { label: 'Supprimer des catégories',      group: 'admin',      defaultRoles: ['admin', 'owner'],             feature: ['stock', 'retail'] },
  manage_coupons:         { label: 'Gérer les coupons',            group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: ['coupons', 'retail'] },

  // -- Autres Modules
  assign_livreur:         { label: 'Assigner des livreurs',         group: 'gestion',    defaultRoles: ['staff', 'manager', 'admin', 'owner'], feature: ['livraison', 'delivery'] },
  confirm_delivery:       { label: 'Confirmer les livraisons',     group: 'gestion',    defaultRoles: ['staff', 'manager', 'admin', 'owner'], feature: ['livraison', 'delivery'] },
  manage_livreurs:        { label: 'Gérer la liste des livreurs',   group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: ['livraison', 'delivery'] },
  manage_revendeurs:      { label: 'Gérer les revendeurs',         group: 'gestion',    defaultRoles: ['admin', 'owner'],             feature: ['revendeurs', 'retail'] },
  manage_reseller_clients: { label: 'Gérer clients revendeurs',     group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: ['revendeurs', 'retail'] },
  manage_reseller_offers:  { label: 'Gérer offres revendeurs',      group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: ['revendeurs', 'retail'] },
  print_reseller_bl:      { label: 'Imprimer bons de livraison',    group: 'gestion',    defaultRoles: ['staff', 'manager', 'admin', 'owner'], feature: ['revendeurs', 'retail'] },
  manage_rooms:           { label: 'Gérer les chambres',           group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'hotel' },
  manage_reservations:    { label: 'Gérer les réservations',       group: 'gestion',    defaultRoles: ['staff', 'manager', 'admin', 'owner'], feature: 'hotel' },
  hotel_checkin:          { label: 'Effectuer les check-in',        group: 'gestion',    defaultRoles: ['staff', 'manager', 'admin', 'owner'], feature: 'hotel' },
  hotel_checkout:         { label: 'Effectuer les check-out',       group: 'gestion',    defaultRoles: ['staff', 'manager', 'admin', 'owner'], feature: 'hotel' },
  hotel_cancel_res:       { label: 'Annuler des réservations',      group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'hotel' },
  manage_guests:          { label: 'Gérer les clients hôtel',      group: 'gestion',    defaultRoles: ['staff', 'manager', 'admin', 'owner'], feature: 'hotel' },
  create_dossier:         { label: 'Créer nouveaux dossiers',      group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'dossiers' },
  edit_dossier:           { label: 'Modifier les dossiers',         group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'dossiers' },
  manage_workflows:       { label: 'Gérer modèles processus',       group: 'gestion',    defaultRoles: ['admin', 'owner'],             feature: 'dossiers' },
  launch_workflow:        { label: 'Lancer un processus',           group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'dossiers' },
  add_fee:                { label: 'Ajouter des honoraires',        group: 'finance',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'honoraires' },
  archive_dossier:        { label: 'Archiver des dossiers',         group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'dossiers' },
  manage_legal_config:    { label: 'Configurer cabinet',           group: 'admin',      defaultRoles: ['admin', 'owner'],             feature: 'dossiers' },
  create_contrat:         { label: 'Créer nouveaux contrats',      group: 'gestion',    defaultRoles: ['staff', 'manager', 'admin', 'owner'], feature: 'contrats' },
  edit_contrat:           { label: 'Modifier les contrats',         group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'contrats' },
  manage_vehicles:        { label: 'Gérer flotte véhicules',       group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'contrats' },
  manage_contract_templates: { label: 'Gérer modèles contrat',      group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'contrats' },
  cancel_contract:        { label: 'Annuler contrat location',     group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'contrats' },
  create_voiture:         { label: 'Ajouter véhicules (vente)',     group: 'gestion',    defaultRoles: ['staff', 'manager', 'admin', 'owner'], feature: 'voitures' },
  edit_voiture:           { label: 'Modifier véhicules (vente)',    group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'voitures' },
  delete_voiture:         { label: 'Supprimer véhicules (vente)',   group: 'admin',      defaultRoles: ['admin', 'owner'],             feature: 'voitures' },
  manage_leads:           { label: 'Gérer les prospects (leads)',   group: 'gestion',    defaultRoles: ['staff', 'manager', 'admin', 'owner'], feature: 'voitures' },
  manage_staff:           { label: 'Gérer les employés',           group: 'admin',      defaultRoles: ['admin', 'owner'],             feature: 'staff' },
  manage_staff_attendance: { label: 'Gérer les présences',          group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'staff' },
  manage_staff_payroll:    { label: 'Gérer la paie',                group: 'admin',      defaultRoles: ['admin', 'owner'],             feature: 'staff' },
  manage_team_tracking:    { label: 'Suivre équipe sur carte',      group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'tracking' },
  manage_daily_menu:      { label: 'Gérer le menu du jour',        group: 'gestion',    defaultRoles: ['staff', 'manager', 'admin', 'owner'], feature: 'restaurant' },
  reply_whatsapp:         { label: 'Répondre sur WhatsApp',        group: 'gestion',    defaultRoles: ['manager', 'admin', 'owner'], feature: 'whatsapp' },
  manage_whatsapp:        { label: 'Gérer intégration WhatsApp',    group: 'admin',      defaultRoles: ['admin', 'owner'],             feature: 'whatsapp' },
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

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
