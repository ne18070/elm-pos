# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
yarn dev              # Electron desktop (Next.js on :3000 + Electron window)
yarn web:dev          # Web only on :3001 (no Electron)

# Type checking & linting
yarn typecheck        # tsc --noEmit (root tsconfig — covers main + types)
cd renderer && npx tsc --noEmit   # typecheck renderer only
yarn lint             # eslint on .ts/.tsx

# Production builds
yarn web:build && yarn web:start  # Web (Vercel-style)
yarn dist:win / dist:mac / dist:linux  # Electron installers

# Supabase
# No CLI — run migrations manually in Supabase dashboard SQL editor (in order)
```

## Architecture

```
elm-pos/
├── main/         Electron main process (window, IPC handlers, SQLite offline store)
├── hardware/     Hardware drivers — printer (ESC/POS USB+TCP), scanner (HID), NFC
├── renderer/     Next.js 14 App Router — the entire UI, shared between Electron & web
├── services/     Supabase data layer — imported by both main and renderer
├── types/        Shared TypeScript types (import via @pos-types alias)
└── supabase/migrations/  PostgreSQL schema, RLS policies, functions — apply in order
```

**Critical rule**: `hardware/` is NEVER imported by `renderer/`. Hardware access goes through Electron IPC only.

### Renderer path aliases (defined in `renderer/tsconfig.json`)

| Alias | Resolves to |
|---|---|
| `@/*` | `renderer/*` |
| `@services/*` | `services/*` |
| `@domain/*` | `domain/*` |
| `@pos-types` | `types/index.ts` |

### Next.js route groups

| Group | Purpose |
|---|---|
| `(auth)` | Login, signup, onboarding |
| `(dashboard)` | All authenticated business pages |
| `(public)` | Public-facing pages (boutique, tracking, developers, etc.) |
| `(backoffice)` | Superadmin only |
| `(kiosk)` | Customer-facing display mode |

### Data flow

- **Renderer → Supabase**: via `@services/supabase/*.ts` (uses anon key + RLS)
- **Renderer → Hardware**: via `renderer/lib/ipc.ts` → `window.electronAPI` (Electron only) — falls back to browser stubs in web mode
- **API routes (`/api/v1/*`)**: use `SUPABASE_SERVICE_ROLE_KEY` (admin client, bypasses RLS) — authenticated via `X-API-Key` header, see `renderer/lib/api-v1-auth.ts`

### Auth architecture

Auth is **client-side only** via `AuthProvider` (`renderer/app/providers/auth-provider.tsx`). The session lives in `localStorage` (Supabase default), which is inaccessible to Next.js middleware running on the server. The middleware at `renderer/middleware.ts` intentionally passes all requests through — this is by design, not an oversight.

`AuthProvider` handles all auth checks: it calls `supabase.auth.getSession()` on mount, listens to `onAuthStateChange`, and re-checks on `window.focus`/`online` events. Unauthenticated users are redirected to `/login` client-side.

**Consequence**: SSR pages must not rely on server-side auth. Data fetching on protected pages goes through RLS-protected Supabase queries — even if the page HTML renders, data won't load without a valid session.

### Supabase admin client

All server route handlers that need `SUPABASE_SERVICE_ROLE_KEY` must import from `renderer/lib/supabase-admin.ts`:

```ts
import { getSupabaseAdmin } from '@/lib/supabase-admin';
```

Never define `getAdmin()` or `createClient(...serviceKey...)` inline in route files. The shared utility is the only place the service role key is used.

### State management (Zustand stores in `renderer/store/`)

- `auth` — user, business, businesses list (persisted to localStorage + sessionStorage)
- `cart` — POS cart state
- `cashSession` — active caisse session
- `subscription` — plan, trial status, feature gates
- `permissions` — role-based permission overrides
- `notifications` — toast queue (use `success()` / `error()` from `useNotificationStore`)
- `sidebar`, `theme`, `realtime`, `customers`

### Auth & routing

`AuthProvider` (`renderer/app/providers/auth-provider.tsx`) runs on every page load. It:
1. Reads the Supabase session
2. Loads user profile, business, subscription, permissions
3. Redirects unauthenticated users away from protected routes

`PUBLIC_PATHS` in that file controls which routes skip auth. Add new public routes there.

### Service layer pattern

All Supabase queries live in `services/supabase/*.ts`. These files use the browser-side supabase client with RLS applying to all queries.

**`database.types.ts` is up to date.** All service files use proper typed patterns — no `const db = supabase as any` or broad `as any` casts. To regenerate types after a schema change:

```bash
npx supabase gen types typescript --project-id <your-project-id> > services/supabase/database.types.ts
```

**Typing patterns for service files** — Supabase v2's `RejectExcessProperties<T>` constraint means `Record<string, unknown>` does NOT work as an insert/update payload. Use these patterns:

```ts
import type { TablesInsert, TablesUpdate, Json } from './database.types';

// SELECT — DB shape doesn't match local interface (nullability, enum strings, etc.)
return (data ?? []) as unknown as LocalType[];
return (data ?? null) as unknown as LocalType | null;

// INSERT / UPSERT
.insert(payload as unknown as TablesInsert<'table_name'>)

// UPDATE
.update(patch as unknown as TablesUpdate<'table_name'>)

// JSON columns (documents, metadata, inspection fields)
documents: localArray as unknown as Json

// Optional RPC params: DB-generated types use `string | undefined`, NOT `string | null`
p_optional_param: value ?? undefined   // NOT value ?? null
```

Do not use `const db = supabase as any` — it defeats all type safety on every downstream call.

### REST API (`/api/v1/*`)

External API key authentication. All routes:
- Import `validateApiKey`, `getApiKey`, `handleAuthError` from `renderer/lib/api-v1-auth.ts`
- Use `export const runtime = 'nodejs'`
- Return CORS headers via `corsHeaders()`
- Require a scope (e.g. `read:products`, `write:orders`)
- Automatically enforce subscription validity (402 if expired)

## Supabase security model

The app uses two distinct Supabase clients depending on context:

| Client | Key | Where | RLS |
|---|---|---|---|
| Browser client (`services/supabase/client.ts`) | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Renderer, service layer | Enforced — isolates data per `business_id` |
| Admin client (inline in API routes) | `SUPABASE_SERVICE_ROLE_KEY` | `/api/v1/*` server routes only | Bypassed — use only when RLS would block legitimate access |

**Rules:**
- `SUPABASE_SERVICE_ROLE_KEY` never appears in any file under `renderer/app` except inside `app/api/` route handlers (server-only)
- All tables have RLS enabled — `business_members` is the source of truth for which user can access which business
- When writing new API routes, always validate the API key first (`validateApiKey`) before touching any data

## Business type UX contracts

Each module serves a different operator with a different mental model. Match the UX to the context.

| Module | Route | UX contract |
|---|---|---|
| **Caisse / POS** | `/pos` | Speed above all. Large tap targets. No confirmation dialogs on the payment path. Works one-handed. Offline-capable. |
| **Restaurant** | `/restaurant` | Visual floor plan is the primary view. Table status readable at a glance via color. Real-time updates without manual refresh. |
| **Hôtel** | `/hotel` | Availability timeline first. Guest lookup must be fast (search-as-you-type). Check-in/out is a guided flow, not a form. |
| **École / Élèves** | `/eleves`, `/classes`, `/bulletins`, `/scolarite` | Class → student hierarchy. Bulk actions for grading and fee collection. Parent contact info always one tap away. |
| **Atelier / Services** | `/services` | Kanban status board (attente → en_cours → terminé → payé). Technician assignment visible inline. Customer never has to call to check status. |
| **Revendeurs / Grossiste** | `/revendeurs` | Price tier and volume offers always visible alongside the product. Client hierarchy (revendeur → ses clients) must be navigable without going back to a list. |
| **Location de véhicules** | `/voitures`, `/location` | Availability calendar is the entry point. Contract generation is one action after selecting vehicle + dates. Return inspection is a checklist, not a free-text field. |
| **Juridique / Dossiers** | `/dossiers`, `/contrats`, `/honoraires` | Document-centric layout. Dossier status drives the visual hierarchy. Honoraires are calculated, never typed manually. |
| **Livraison** | `/livraison` | Article-by-article scan flow. Barcode scanner is primary input. Manual fallback always present. Progress shown as "X / N articles validés". |
| **Analytiques** | `/analytics` | Numbers are the hero — big, readable, no decoration. Date range selector always visible. Export available on every view. |

## UI/UX principles

Before implementing any screen, component, or feature, verify:

1. **Is it obvious?** — A first-time user should understand it immediately, no tooltips required
2. **Is it necessary?** — Remove anything that doesn't serve a clear user action
3. **Is it fast?** — Perceived performance matters; skeleton states over spinners, optimistic updates where safe
4. **Is it mobile-friendly?** — Design mobile-first; touch targets ≥ 44px, no hover-only interactions
5. **Does it reduce user effort?** — Default values, smart placeholders, one-tap actions

**Visual hierarchy**: one primary action per screen, supporting actions visually subordinate. Users should never ask "what do I do next?"

**Spacing & layout**: consistent internal rhythm. Cramped UIs feel unfinished; generous whitespace signals quality.

**Forms**: minimize fields. Inline validation, not on-submit. Labels always visible (no placeholder-as-label). Error messages say what to fix, not just that something is wrong.

**Navigation**: breadcrumbs or back buttons on every nested view. Active state always visible in sidebar/nav. Deep links should work (no state trapped in memory).

**Trust**: loading states for every async action. Destructive actions require confirmation. Empty states explain why — not just "nothing here."

## Theming system

Theme tokens are CSS variables in `renderer/app/globals.css`. Dark mode is the default (`:root`). Light mode overrides via `[data-theme="light"]` on the `<html>` element.

**Always use semantic tokens — never raw Tailwind color classes:**

| Use | Instead of |
|---|---|
| `bg-surface`, `bg-surface-card`, `bg-surface-input` | `bg-slate-800`, `bg-slate-900` |
| `text-content-primary`, `text-content-secondary`, `text-content-muted` | `text-white`, `text-slate-400` |
| `border-surface-border` | `border-slate-700` |
| `text-status-success/warning/error/info` | `text-green-400`, `text-red-400` |
| `bg-badge-success/warning/error/info` | `bg-green-900/20` |
| `text-brand-400`, `bg-brand-600` | any hardcoded brand color |

Use `.theme-dark` class on a container to force dark mode tokens regardless of global theme (sidebar, POS header, landing pages, etc.).

Public pages that should always appear in light mode: add `data-theme="light"` directly on the outer `<div>`.

## Supabase: mandatory GRANTs on new tables

Every new table or view must include explicit grants (required as of May 2026):

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.your_table TO authenticated;
GRANT ALL ON TABLE public.your_table TO service_role;
GRANT EXECUTE ON FUNCTION public.your_fn() TO authenticated, service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
```

See `supabase/migrations/085_explicit_grants.sql` for the baseline.

## Environment variables

| Variable | Where used |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Renderer + services (client) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Renderer + services (client) |
| `SUPABASE_SERVICE_ROLE_KEY` | API routes only (never expose to client) |
| `ELECTRON_BUILD=1` | Switches Next.js to static export mode |
| `ELECTRON_DEV=true` | Forces dev mode in Electron |
