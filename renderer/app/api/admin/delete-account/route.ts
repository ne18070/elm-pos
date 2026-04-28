import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

async function requireSuperadmin(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return 'Token manquant';

  const token = auth.slice(7);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const client = createClient(url, anon, { auth: { persistSession: false } });

  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) return 'Token invalide';

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: profile } = await admin.from('users').select('is_superadmin').eq('id', user.id).single();
  if (!profile?.is_superadmin) return 'Acces superadmin requis';

  return null;
}

export async function POST(req: NextRequest) {
  const authError = await requireSuperadmin(req);
  if (authError) return NextResponse.json({ error: authError }, { status: 403 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  let body: { ownerId: string; businessId: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });
  }

  const { ownerId, businessId } = body;
  if (!ownerId) {
    return NextResponse.json({ error: 'ID du propriétaire manquant' }, { status: 400 });
  }

  try {
    // 1. Trouver l'organisation associée pour la supprimer aussi (car ON DELETE SET NULL)
    const { data: bizData } = await admin
      .from('businesses')
      .select('organization_id')
      .eq('id', businessId)
      .single();

    // 2. Supprimer l'utilisateur Auth (ceci va cascade sur businesses, subscriptions, members, et toutes les données business)
    const { error: deleteError } = await admin.auth.admin.deleteUser(ownerId);
    if (deleteError) throw deleteError;

    // 3. Supprimer l'organisation si elle existe
    if (bizData?.organization_id) {
      await admin.from('organizations').delete().eq('id', bizData.organization_id);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[delete-account]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
