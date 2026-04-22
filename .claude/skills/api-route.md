---
name: api-route
description: Create a Next.js API route. Use when adding a new /api endpoint, especially for backoffice/admin operations that need to bypass RLS using the service role key.
---

When creating a new API route:

1. Create the file at `renderer/app/api/<path>/route.ts`

2. For superadmin-only routes (backoffice operations), use this pattern:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function requireSuperadmin(req: NextRequest): { error: string } | { adminClient: any } {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.replace('Bearer ', '');
  if (!token) return { error: 'Unauthorized' };

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  return { adminClient };
}

export async function GET(req: NextRequest) {
  const result = requireSuperadmin(req);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 401 });
  const { adminClient } = result;

  const { data, error } = await adminClient.from('<table>').select('*');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const result = requireSuperadmin(req);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 401 });
  const { adminClient } = result;

  const body = await req.json();
  const { id, ...fields } = body;

  const { data, error } = await adminClient.from('<table>').update(fields).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
```

3. For the client-side caller, use this fetch pattern (in `services/supabase/<domain>.ts`):

```ts
import { supabase } from './client';

export async function fetchSomething() {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? '';

  const res = await fetch('/api/<path>', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error((await res.json()).error ?? 'Erreur serveur');
  return res.json();
}
```

4. Note: `SUPABASE_SERVICE_ROLE_KEY` is a server-only secret — never expose it client-side. The API route is the correct pattern for bypassing RLS when needed.
