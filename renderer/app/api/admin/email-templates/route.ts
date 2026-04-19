import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@services/supabase/database.types';

type EmailTemplate = Database['public']['Tables']['email_templates']['Row'];

function getServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    { auth: { persistSession: false } }
  );
}

async function requireSuperadmin(req: NextRequest): Promise<string | null> {
  const token = req.headers.get('authorization')?.slice(7);
  if (!token) return null;
  const anonClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { auth: { persistSession: false } }
  );
  const { data: { user }, error } = await anonClient.auth.getUser(token);
  if (error || !user) return null;
  const { data: profile } = await getServiceClient()
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  return profile?.role === 'superadmin' ? user.id : null;
}

export async function GET(req: NextRequest) {
  const userId = await requireSuperadmin(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await getServiceClient()
    .from('email_templates')
    .select('*')
    .order('created_at');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const userId = await requireSuperadmin(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as Partial<EmailTemplate> & { id: string };
  const { id, name, description, html_body, is_active } = body;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { error } = await getServiceClient()
    .from('email_templates')
    .update({ name, description, html_body, is_active })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
