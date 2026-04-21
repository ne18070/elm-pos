import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

async function requireSuperadmin(req: NextRequest): Promise<{ error: string } | { adminClient: ReturnType<typeof createClient> }> {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return { error: 'Token manquant' };

  const token = auth.slice(7);
  const url   = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const user  = createClient(url, anon, { auth: { persistSession: false } });

  const { data: { user: authUser }, error } = await user.auth.getUser(token);
  if (error || !authUser) return { error: 'Token invalide' };

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: profile } = await admin.from('users').select('is_superadmin').eq('id', authUser.id).single();
  if (!profile?.is_superadmin) return { error: 'Accès superadmin requis' };

  return { adminClient: admin };
}

// GET /api/admin/email-templates
export async function GET(req: NextRequest) {
  const result = await requireSuperadmin(req);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 403 });

  const { data, error } = await result.adminClient
    .from('email_templates')
    .select('*')
    .order('created_at');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PATCH /api/admin/email-templates
export async function PATCH(req: NextRequest) {
  const result = await requireSuperadmin(req);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 403 });

  let body: { id: string; name?: string; description?: string; html_body?: string; is_active?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });
  }

  const { id, ...patch } = body;
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

  const { error } = await result.adminClient
    .from('email_templates')
    .update(patch)
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
