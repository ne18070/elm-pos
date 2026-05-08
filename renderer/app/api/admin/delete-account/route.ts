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
    // 1. Trouver toutes les businesses de ce owner
    const { data: allBiz } = await admin
      .from('businesses')
      .select('id, organization_id')
      .eq('owner_id', ownerId);

    const bizIds = (allBiz ?? []).map((b: any) => b.id);
    const orgId  = (allBiz ?? []).find((b: any) => b.organization_id)?.organization_id ?? null;

    // 2. Supprimer les données liées pour chaque business (contourne les triggers)
    if (bizIds.length > 0) {
      await Promise.all([
        admin.from('subscriptions').delete().in('business_id', bizIds),
        admin.from('business_members').delete().in('business_id', bizIds),
        admin.from('analytics_events').delete().in('business_id', bizIds),
        admin.from('monitoring_vitals').delete().in('business_id', bizIds),
      ]);
      // Supprimer les businesses elles-mêmes
      await admin.from('businesses').delete().in('id', bizIds);
    }

    // 3. Supprimer l'organisation
    if (orgId) {
      await admin.from('organizations').delete().eq('id', orgId);
    }

    // 4. Supprimer le profil public user
    await admin.from('users').delete().eq('id', ownerId);

    // 5. Supprimer le compte Auth (plus de données dépendantes à ce stade)
    const { error: deleteError } = await admin.auth.admin.deleteUser(ownerId);
    if (deleteError) throw deleteError;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[delete-account]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
