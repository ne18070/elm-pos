# Elm POS — Application de caisse multi-établissements

> Fonctionne sur WEB, Windows, macOS et Linux. Connectée au cloud, avec **mode hors-ligne intégré**.

---

## Fonctionnalités

### Caisse (POS)
- Catalogue produits avec recherche par nom, SKU ou code-barres
- Filtrage par catégorie, vue grille ou liste
- Scan code-barres physique
- **4 modes de paiement** : espèces, carte bancaire, mobile money, acompte/partiel
- Calcul automatique de la monnaie à rendre
- **Écran client secondaire** : affiche la facture en temps réel sur un second écran
- Mise en attente de commandes (commandes en suspens)
- Application de coupons de réduction

### Commandes & Livraisons
- Historique complet avec statuts : payé, en attente, annulé, remboursé
- Suivi des acomptes et du reste à régler par commande
- Workflow de livraison : picking → en route → livré
- Impression de facture (PDF) et partage par WhatsApp

### Produits & Stock
- Gestion complète des produits : nom, prix, SKU, code-barres, image
- Support des **variantes** (ex : tailles, couleurs) avec stock individuel
- Alertes automatiques stock bas (seuil configurable)
- Historique des approvisionnements par fournisseur
- Import et export CSV

### Coupons & Remises
- 3 types de remises : **pourcentage**, **montant fixe**, **article offert**
- Limites d'utilisation, date d'expiration, montant minimum de commande
- Suivi des performances : économies générées, nombre d'utilisations

### Revendeurs (Wholesale)
- Gestion des partenaires revendeurs et de leurs clients
- Offres de gros avec quantités minimum et quantités bonus
- Import en masse des revendeurs et clients

### Statistiques & Comptabilité
- **KPIs** : chiffre d'affaires, nombre de commandes, panier moyen
- Top produits par revenu, tendances de ventes journalières
- Performance des coupons, ventes revendeurs
- **Journal comptable**, bilan, compte de résultat
- Synchronisation automatique des ventes vers la comptabilité

### Gestion d'équipe
| Rôle | Accès |
|------|-------|
| **Propriétaire** | Accès total, gestion des établissements et de l'équipe |
| **Administrateur** | Produits, commandes, coupons, statistiques |
| **Caissier** | Caisse et historique de ses propres commandes |

- Invitation de membres par email
- Changement de rôle, retrait d'un membre
- **Blocage de compte** et **réinitialisation de mot de passe** (propriétaire uniquement)

### Multi-établissements
- Un utilisateur peut appartenir à **plusieurs boutiques**
- Bascule d'établissement depuis la barre latérale, sans se déconnecter
- Données entièrement isolées par établissement
- Isolation par onglet navigateur (chaque onglet peut avoir un établissement actif différent)

### Mode hors-ligne
- Les ventes sont enregistrées **localement** si la connexion est interrompue
- Synchronisation automatique à la reconnexion
- File d'attente visible avec compteur de transactions en attente

---

## Plateformes supportées

- **Windows** — installateur NSIS + version portable
- **macOS** — DMG
- **Linux** — AppImage
