---
name: api-route
description: Create a Next.js API route. Use when adding a new /api endpoint, especially for backoffice/admin operations that need to bypass RLS using the service role key.
---

When creating a new API route:

1. Create the file at `renderer/app/api/<path>/route.ts`, with `export const runtime = 'nodejs'`.

2. Pick the authentication that matches the caller — **every route authenticates before touching data**. The service-role client bypasses RLS: a route that only checks "a token is present" gives full database access to anyone.

| Caller | Check | Helper |
|---|---|---|
| Backoffice (superadmin) | Session token + `users.is_superadmin` | `requireSuperadmin` from `@/lib/admin-auth` |
| External integration (`/api/v1/*`) | `X-API-Key` + scope + subscription | `validateApiKey` from `@/lib/api-v1-auth` (see CLAUDE.md) |
| Dashboard user acting on a business | Session token + membership in that business | `admin.auth.getUser(token)` then `business_members` lookup (see `app/api/client-push/notify/route.ts`) |
| Public page (no login) | A secret from the URL (tracking/technician token) checked against its table, or no service role at all — prefer a `SECURITY DEFINER` RPC granted to `anon` | — |

3. Superadmin-only routes (backoffice operations):

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin } from '@/lib/admin-auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const ctx = await requireSuperadmin(req);
  if ('response' in ctx) return ctx.response;   // 401 / 403 / 500 already built

  const { data, error } = await ctx.admin.from('<table>').select('*');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireSuperadmin(req);
  if ('response' in ctx) return ctx.response;

  let body: { id?: string; name?: string; is_active?: boolean };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'JSON invalide' }, { status: 400 }); }

  // Whitelist the editable columns — never spread the request body into update()
  const { id, name, is_active } = body;
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

  const { error } = await ctx.admin.from('<table>').update({ name, is_active }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

Rules:
- Never create a service-role client inline (`createClient(url, SERVICE_ROLE_KEY)`): use `ctx.admin` from `requireSuperadmin`, or `getSupabaseAdmin()` from `@/lib/supabase-admin` once the caller is authenticated.
- Supabase does not throw: check `{ error }` on every write. For multi-step writes, undo what was created if a later step fails (see `app/api/admin/approve-business/route.ts`).
- Anything that ends up in a message, email or notification is read from the database, not taken from the request body.

4. For the client-side caller, use this fetch pattern (in `services/supabase/<domain>.ts`):

```ts
import { supabase } from './client';

export async function fetchSomething() {
  const { data: { session } } = await supabase.auth.getSession();

  const res = await fetch('/api/<path>', {
    headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
  });
  const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw new Error(body.error ?? 'Erreur serveur');
  return body;
}
```

5. `SUPABASE_SERVICE_ROLE_KEY` is a server-only secret — never expose it client-side, never import `@/lib/supabase-admin` outside `app/api/`.
