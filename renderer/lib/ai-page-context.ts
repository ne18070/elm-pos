export type PageInfo = { name: string; actions: string };

const PAGE_MAP: Array<[string, PageInfo]> = [
  ['/pos', {
    name: 'Point de vente (Caisse)',
    actions: 'Sélectionner des articles, appliquer un coupon ou remise fidélité, choisir le mode de paiement (espèces, mobile money, carte), encaisser, ouvrir/fermer la session de caisse, imprimer le ticket.',
  }],
  ['/orders', {
    name: 'Historique des commandes',
    actions: 'Filtrer les commandes par date/statut, consulter le détail, voir les articles commandés, annuler une commande.',
  }],
  ['/products', {
    name: 'Catalogue produits',
    actions: 'Ajouter/modifier/supprimer des produits, mettre à jour le stock, créer des catégories, importer en masse via CSV.',
  }],
  ['/clients', {
    name: 'Clients',
    actions: 'Ajouter/modifier un client, consulter les points de fidélité, voir l\'historique d\'achats, exporter la liste.',
  }],
  ['/services', {
    name: 'Ordres de travail',
    actions: 'Créer un ordre de travail, ajouter des articles/pièces, changer le statut (en attente → en cours → terminé → payé), encaisser, imprimer le reçu de service.',
  }],
  ['/analytics', {
    name: 'Analytiques',
    actions: 'Voir les ventes par période, meilleurs produits, heures de pointe, chiffre d\'affaires, exporter les rapports.',
  }],
  ['/comptabilite', {
    name: 'Comptabilité',
    actions: 'Consulter le journal des transactions, les dépenses, le solde de caisse, les rapports financiers.',
  }],
  ['/staff', {
    name: 'Équipe',
    actions: 'Ajouter des employés, gérer les rôles et permissions, consulter les pointages et présences.',
  }],
  ['/settings', {
    name: 'Paramètres',
    actions: 'Modifier les informations du business, configurer TVA/devise, activer/désactiver des modules, gérer l\'abonnement.',
  }],
  ['/hotel', {
    name: 'Hôtel',
    actions: 'Gérer les chambres, créer/modifier des réservations, effectuer le check-in et check-out.',
  }],
  ['/honoraires', {
    name: 'Honoraires',
    actions: 'Créer des fiches d\'honoraires, suivre les paiements, générer des factures clients.',
  }],
  ['/voitures', {
    name: 'Parc automobile',
    actions: 'Gérer les véhicules clients, enregistrer des interventions et réparations.',
  }],
  ['/contrats', {
    name: 'Contrats',
    actions: 'Créer des contrats depuis des modèles, les éditer, les partager et suivre les signatures.',
  }],
  ['/dossiers', {
    name: 'Dossiers',
    actions: 'Créer et gérer des dossiers clients, ajouter des documents, suivre l\'avancement.',
  }],
  ['/livraisons', {
    name: 'Livraisons',
    actions: 'Voir les commandes à livrer, assigner des livreurs, mettre à jour les statuts de livraison.',
  }],
  ['/eleves', {
    name: 'Élèves',
    actions: 'Gérer les inscriptions et dossiers élèves, consulter la scolarité.',
  }],
  ['/classes', {
    name: 'Classes',
    actions: 'Gérer les classes, niveaux et groupes d\'élèves.',
  }],
  ['/depenses', {
    name: 'Dépenses',
    actions: 'Enregistrer une dépense, catégoriser, voir le total par période.',
  }],
  ['/assistant', {
    name: 'Assistant IA',
    actions: 'Poser des questions sur les données du business.',
  }],
];

export function getPageInfo(pathname: string): PageInfo | null {
  for (const [route, info] of PAGE_MAP) {
    if (pathname === route || pathname.startsWith(route + '/')) return info;
  }
  return null;
}
