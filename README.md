# Elm POS — Caisse Multi-Établissements

Système de caisse (POS) desktop complet, production-grade, multi-établissements.
Construit avec **Electron + Next.js + Supabase**.

---

## Fonctionnalités

| Module | Détail |
|---|---|
| **Authentification** | Supabase Auth · Rôles Admin / Propriétaire / Caissier |
| **Multi-établissements** | Isolation complète des données par business |
| **Caisse (POS)** | Grille produits · Panier · Remises · Coupons |
| **Paiement** | Espèces / Carte / Mobile Money · Rendu monnaie |
| **Reçu** | Impression thermique ESC/POS via USB |
| **Code-barres** | Scanner HID (clavier) + USB natif |
| **NFC** | Lecture tags/cartes via nfc-pcsc (ACR122U etc.) |
| **Mode hors ligne** | SQLite local · File de sync · Reconnexion auto |
| **Statistiques** | CA · Commandes · Top produits · Graphe journalier |
| **Produits** | CRUD · Catégories · Variantes · Gestion stock |
| **Coupons** | % ou montant fixe · Expiration · Limite utilisation |

---

## Architecture

```
elm-pos/
├── main/           # Electron main process
│   ├── index.ts      → Fenêtre principale
│   ├── preload.ts    → Bridge IPC sécurisé (contextBridge)
│   ├── ipc/          → Gestionnaires IPC (hardware, orders, sync)
│   └── store/        → SQLite local (better-sqlite3)
│
├── hardware/       # Couche matérielle (JAMAIS importée par le renderer)
│   ├── printer/      → ESC/POS via USB
│   ├── scanner/      → HID + uiohook-napi
│   └── nfc/          → nfc-pcsc (PC/SC)
│
├── renderer/       # Application Next.js (UI)
│   ├── app/          → App Router (layout, pages)
│   ├── components/   → Composants UI (pos, orders, products, coupons)
│   ├── hooks/        → Hooks React (data fetching)
│   ├── store/        → Zustand (auth, cart, notifications)
│   └── lib/          → Supabase client, IPC helper, utils
│
├── services/       # Couche API Supabase (partagée main + renderer)
│   └── supabase/     → auth, products, orders, analytics, coupons
│
├── types/          # Types TypeScript partagés
│   └── index.ts
│
└── supabase/       # Infrastructure Supabase
    ├── migrations/   → Schéma PostgreSQL + RLS + fonctions
    └── functions/    → Edge Functions (create-order, validate-coupon)
```

### Flux de données

```
UI (Next.js renderer)
  ↓ window.electronAPI (contextBridge)
Electron main process
  ↓ IPC handlers
Hardware (printer / scanner / NFC)  ←→  Supabase (DB / Edge Functions)
  ↓
SQLite local (mode hors ligne)
  ↓ sync auto toutes les 30s
Supabase
```

---

## Prérequis

- Node.js 20+
- npm 10+
- Supabase CLI (`npm install -g supabase`)
- (Optionnel) Imprimante thermique USB compatible ESC/POS
- (Optionnel) Lecteur NFC PC/SC (ACR122U, ACR1252U...)

---

## Installation

### 1. Cloner et installer les dépendances

```bash
git clone https://github.com/votre-org/elm-pos.git
cd elm-pos
npm install
```

### 2. Configurer l'environnement

```bash
cp .env.example .env
```

Renseigner dans `.env` :
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### 3. Initialiser Supabase

```bash
# Démarrer Supabase local
supabase start

# Appliquer les migrations
supabase db reset

# (Optionnel) Déployer les Edge Functions
supabase functions deploy create-order
supabase functions deploy validate-coupon
```

### 4. Lancer en développement

```bash
npm run dev
```

Cela démarre simultanément :
- Next.js sur `http://localhost:3000`
- Electron (attend que Next.js soit prêt)

---

## Build de production

```bash
# Build complet
npm run dist

# Par plateforme
npm run dist:win    # Windows (.exe NSIS)
npm run dist:mac    # macOS (.dmg)
npm run dist:linux  # Linux (.AppImage)
```

---

## Configuration Supabase

### Créer un premier utilisateur

Dans Supabase Dashboard → Authentication → Users → Inviter un utilisateur.
Puis dans la table `users`, définir son `role` (`admin`, `owner`, ou `staff`) et son `business_id`.

### Créer un établissement

```sql
INSERT INTO businesses (name, type, currency, tax_rate, owner_id)
VALUES ('Mon Restaurant', 'restaurant', 'XOF', 18, '<uuid-utilisateur>');

UPDATE users SET business_id = '<uuid-business>' WHERE id = '<uuid-utilisateur>';
```

---

## Matériel supporté

### Imprimante thermique

Compatible avec tout modèle ESC/POS via USB :
- Epson TM-T20, TM-T88
- Star Micronics TSP100
- HOIN HOP-E801
- Tout clone USB générique

```bash
# Vérifier la détection
node -e "const usb = require('escpos-usb'); console.log(usb.list())"
```

### Scanner code-barres

- **Mode HID** (recommandé) : brancher et utiliser sans configuration
- **Mode USB natif** : via `uiohook-napi` (détection globale, même hors focus)

### Lecteur NFC

Compatible PC/SC (pilote `pcscd` requis sur Linux) :
- ACS ACR122U
- ACS ACR1252U
- SpringCard Prox'N'Roll

---

## Variables d'environnement

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé publique anon |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service (processus Electron main uniquement) |
| `NODE_ENV` | `development` ou `production` |
| `ELECTRON_DEV` | `true` pour forcer le mode dev |

---

## Structure de la base de données

| Table | Description |
|---|---|
| `businesses` | Établissements |
| `users` | Profils utilisateurs (lié à `auth.users`) |
| `categories` | Catégories de produits |
| `products` | Produits avec variantes (JSONB) |
| `orders` | Commandes |
| `order_items` | Articles de commande (snapshot prix) |
| `payments` | Paiements (un order peut avoir plusieurs) |
| `coupons` | Codes promotionnels |

Toutes les tables ont **Row Level Security (RLS)** activé.

---

## Roadmap

- [ ] Impression PDF (react-pdf)
- [ ] Multi-caissiers simultanés (Supabase Realtime)
- [ ] Application mobile compagnon (Expo)
- [ ] Gestion des retours / remboursements
- [ ] Intégration paiement carte (Stripe Terminal)
- [ ] Export comptable (CSV / Excel)
- [ ] Programme de fidélité

---

## Licence

MIT — Libre d'utilisation commerciale.
