# Elm POS — Caisse Multi-Établissements

Système de caisse (POS) **desktop + web** complet, production-grade, multi-établissements.
Construit avec **Electron + Next.js + Supabase**.

---

## Fonctionnalités

| Module | Détail |
|---|---|
| **Authentification** | Supabase Auth · Rôles Owner / Admin / Staff |
| **Multi-établissements** | Isolation complète des données par business |
| **Caisse (POS)** | Grille produits · Panier · Remises · Coupons · Acomptes |
| **Paiement** | Espèces / Carte / Mobile Money · Rendu monnaie · Paiement partiel |
| **Mode Grossiste** | Prix de gros par produit · Sélection revendeur + client · Offres volume |
| **Revendeurs** | CRUD revendeurs & clients · Offres volume (ex : 100 achetés → 1 offert) · Import CSV |
| **Factures** | Templates totalement personnalisables · Thermique 80mm · A4 · A5 · Duplicata |
| **Partage WhatsApp** | Envoi de facture PDF via WhatsApp depuis la caisse ou l'historique |
| **QR Code** | QR sur tickets (encode le numéro de reçu) |
| **Montant en lettres** | Affichage automatique sur toutes les factures |
| **Livraison** | Vérification article par article · Scanner code-barres · Mode manuel |
| **Code-barres** | Scanner HID (clavier) · Toggle activer/désactiver |
| **NFC** | Lecture tags/cartes via PC/SC — optionnel (ACR122U etc.) |
| **Mode hors ligne** | SQLite local · File de sync · Reconnexion automatique |
| **Statistiques** | CA · Commandes · Top produits · Graphe journalier · Onglets Grossiste / Promos |
| **Alertes stock** | Badge temps réel sur produits en rupture · Seuil configurable |
| **Produits** | CRUD · Catégories · Prix de gros · Variantes · Import/Export CSV |
| **Approvisionnement** | Entrées de stock · Historique · Fournisseur |
| **Coupons** | % ou montant fixe · Article offert · Expiration · Limite utilisation |
| **Comptabilité** | Journaux de caisse · Synthèse financière |
| **Journal d'activité** | Audit log complet (commandes, produits, utilisateurs…) |
| **Administration** | Gestion équipe · Invitations · Changement de rôle |
| **Imprimante réseau** | Configuration IP/port · Test de connexion · ESC/POS TCP |
| **Version web** | Déployable sur Vercel · Impression navigateur · Partage WhatsApp |
| **CI/CD** | Build automatique Windows (.exe) · macOS (.dmg) · Linux (.AppImage) |

---

## Architecture

```
elm-pos/
├── main/           # Electron main process
│   ├── index.ts      → Fenêtre principale + protocole elmpos://
│   ├── preload.ts    → Bridge IPC sécurisé (contextBridge)
│   ├── ipc/          → Gestionnaires IPC (hardware, orders, sync)
│   └── store/        → SQLite local (better-sqlite3)
│
├── hardware/       # Couche matérielle (JAMAIS importée par le renderer)
│   ├── printer/      → ESC/POS USB + TCP réseau
│   ├── scanner/      → HID clavier
│   └── nfc/          → nfc-pcsc (PC/SC) — module optionnel
│
├── renderer/       # Application Next.js (UI — partagée Desktop & Web)
│   ├── app/          → App Router (layout, pages dashboard)
│   ├── components/   → Composants UI (pos, orders, products, analytics, revendeurs…)
│   ├── hooks/        → Hooks React (data fetching, alertes stock, offline sync)
│   ├── store/        → Zustand (auth, cart, notifications)
│   └── lib/          → IPC helper, template-config, print-web, share-invoice, utils
│
├── services/       # Couche API Supabase (partagée main + renderer)
│   └── supabase/     → auth, products, orders, analytics, resellers, stock, coupons
│
├── types/          # Types TypeScript partagés
│   └── index.ts
│
├── supabase/       # Infrastructure Supabase
│   └── migrations/   → Schéma PostgreSQL + RLS + fonctions
│
└── vercel.json     # Configuration déploiement web
```

### Flux de données

```
UI (Next.js renderer)
  ↓ window.electronAPI (contextBridge)     ← Desktop uniquement
Electron main process
  ↓ IPC handlers
Hardware (printer / scanner / NFC)  ←→  Supabase (DB / Auth / Realtime)
  ↓
SQLite local (mode hors ligne)
  ↓ sync auto toutes les 30s
Supabase

── Mode Web ──────────────────────────────────────────────────────
UI (Next.js) → Supabase directement · Impression via window.print()
```

---

## Prérequis

- Node.js 20+
- Yarn 1.x (`npm install -g yarn`)
- Compte [Supabase](https://supabase.com) (gratuit)
- (Optionnel) Imprimante thermique USB ou réseau compatible ESC/POS
- (Optionnel) Lecteur NFC PC/SC (ACR122U, ACR1252U…)

---

## Installation

### 1. Cloner et installer les dépendances

```bash
git clone https://github.com/votre-org/elm-pos.git
cd elm-pos
yarn install --ignore-optional
```

> `--ignore-optional` ignore les modules hardware natifs (`escpos`, `escpos-usb`).
> Pour utiliser l'impression USB, lancer `yarn install` sans ce flag.

### 2. Configurer l'environnement

```bash
cp .env.example renderer/.env
```

Renseigner dans `renderer/.env` :
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### 3. Appliquer les migrations Supabase

Dans le dashboard Supabase → **SQL Editor**, exécuter dans l'ordre les fichiers `supabase/migrations/*.sql`.

### 4. Lancer en développement

```bash
# Mode Desktop (Electron)
yarn dev

# Mode Web (navigateur uniquement)
yarn web:dev        # → http://localhost:3001
```

---

## Build de production

### Desktop (Electron)

```bash
yarn dist:win    # Windows — .exe NSIS + portable
yarn dist:mac    # macOS   — .dmg
yarn dist:linux  # Linux   — .AppImage
```

### Web (Vercel)

```bash
# Build local
yarn web:build
yarn web:start

# Déploiement Vercel
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel --prod
```

Ou importer directement le repo dans [vercel.com](https://vercel.com).
Le fichier `vercel.json` configure automatiquement le build.

### Via GitHub Actions (CI/CD automatique)

Créer un tag pour déclencher un build multi-plateforme et une Release GitHub :

```bash
git tag v1.0.0
git push --tags
```

Les secrets à configurer dans **Settings → Secrets → Actions** :

| Secret | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé publique anon |

---

## Configuration Supabase

### Créer un premier utilisateur

Dashboard Supabase → **Authentication → Users → Invite user**.
Puis dans la table `users`, définir `role` (`owner`, `admin` ou `staff`) et `business_id`.

### Créer un établissement

```sql
INSERT INTO businesses (name, type, currency, tax_rate, owner_id)
VALUES ('Mon Commerce', 'retail', 'XOF', 0, '<uuid-utilisateur>');

UPDATE users SET business_id = '<uuid-business>' WHERE id = '<uuid-utilisateur>';
```

---

## Matériel supporté

### Imprimante thermique

Compatible ESC/POS **USB** ou **réseau TCP/IP** :
- Epson TM-T20, TM-T88
- Star Micronics TSP100
- HOIN HOP-E801
- Tout clone USB/réseau générique

La configuration IP/port se fait dans **Paramètres → Imprimante thermique**.

> En mode web, l'impression utilise `window.print()` — aucun driver requis.

### Scanner code-barres

- **Mode HID** (recommandé) : plug & play, aucune configuration
- Activable/désactivable depuis la page Livraison en cas de panne

### Lecteur NFC (optionnel)

Compatible PC/SC (`pcscd` requis sur Linux) :
- ACS ACR122U / ACR1252U
- SpringCard Prox'N'Roll

---

## Variables d'environnement

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé publique anon |
| `ELECTRON_BUILD` | `1` pour activer l'export statique (Electron) |
| `ELECTRON_DEV` | `true` pour forcer le mode développement |

---

## Structure de la base de données

| Table | Description |
|---|---|
| `businesses` | Établissements |
| `users` | Profils utilisateurs (lié à `auth.users`) |
| `categories` | Catégories de produits |
| `products` | Produits · `wholesale_price` pour le mode grossiste |
| `orders` | Commandes · `reseller_id` · `reseller_client_id` · `order_type` |
| `order_items` | Articles de commande (snapshot prix) |
| `payments` | Paiements (plusieurs par commande possible) |
| `coupons` | Codes promotionnels (%, fixe, article offert) |
| `refunds` | Remboursements |
| `stock_entries` | Historique des approvisionnements |
| `resellers` | Revendeurs / vendeurs marché |
| `reseller_clients` | Clients des revendeurs |
| `reseller_offers` | Offres volume (seuil → bonus) |
| `activity_logs` | Journal d'audit (toutes les actions) |

Toutes les tables ont **Row Level Security (RLS)** activé.

---

## Roadmap

- [x] Templates de factures personnalisables
- [x] QR code sur tickets
- [x] Alertes rupture de stock en temps réel
- [x] Scanner code-barres livraison + mode manuel
- [x] Imprimante réseau TCP/IP
- [x] Journal d'activité (audit log)
- [x] CI/CD GitHub Actions (Windows / macOS / Linux)
- [x] Module Revendeurs / Grossistes (prix de gros, clients, offres volume)
- [x] Statistiques Grossiste (par revendeur, client, produit)
- [x] Partage facture via WhatsApp
- [x] Version web (Vercel)
- [ ] Application mobile compagnon (Expo)
- [ ] Intégration paiement carte (Stripe Terminal)
- [ ] Programme de fidélité (points / tampons)

---
