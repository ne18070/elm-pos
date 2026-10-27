import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin } from '@/lib/admin-auth';

export const runtime = 'nodejs';

// GET /api/admin/email-templates
export async function GET(req: NextRequest) {
  const ctx = await requireSuperadmin(req);
  if ('response' in ctx) return ctx.response;

  const { data, error } = await ctx.admin
    .from('email_templates')
    .select('*')
    .order('created_at');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PATCH /api/admin/email-templates
export async function PATCH(req: NextRequest) {
  const ctx = await requireSuperadmin(req);
  if ('response' in ctx) return ctx.response;

  let body: { id: string; name?: string; description?: string; html_body?: string; is_active?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });
  }

  const { id, name, description, html_body, is_active } = body;
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

  // Seuls les champs éditables depuis le backoffice — jamais key/variables
  const { error } = await ctx.admin
    .from('email_templates')
    .update({ name, description, html_body, is_active })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
