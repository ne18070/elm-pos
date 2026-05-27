# Migration ETSOMB → elm-pos

Script d'import des données ETSOMB (produits, clients, revendeurs) vers Supabase.

## Configuration

Créer un fichier `.env` dans ce répertoire :

```env
# API ETSOMB
ETSOMB_API_URL=https://ton-api-etsomb.com
ETSOMB_TOKEN=Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Supabase (service role — bypasse RLS)
SUPABASE_URL=https://lreadzxyenzqhcycyaru.supabase.co
SUPABASE_SERVICE_ROLE_KEY=ton_service_role_key

# Business IDs dans elm-pos
NESTLE_BUSINESS_ID=31418c23-c413-4271-b20a-7869e9618628
SOFIEX_BUSINESS_ID=e7331a96-c0d3-41ec-826c-a1f2ab68919a
```

## Utilisation

```bash
cd scripts/migrate-etsomb
node --env-file=.env import-products.mjs nestle    # importe les articles Nestlé
node --env-file=.env import-products.mjs sofiex    # importe les articles Sofiex
node --env-file=.env import-clients.mjs nestle     # importe les clients
node --env-file=.env import-resellers.mjs          # importe les revendeurs
```

## Ce que chaque script fait

| Script | ETSOMB → elm-pos |
|---|---|
| `import-products.mjs` | `article/listAll` → `products` |
| `import-clients.mjs` | `client/listAll` → `clients` |
| `import-resellers.mjs` | `user/listAll` (revendeurs) → `resellers` |
