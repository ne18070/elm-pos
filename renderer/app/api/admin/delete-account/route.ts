import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin } from '@/lib/admin-auth';
import { check, deleteBusinesses } from '@/lib/admin-delete';

export const runtime = 'nodejs';

/**
 * POST { ownerId, organizationId? }
 * - avec organizationId : supprime cette organisation et ses établissements ; le compte
 *   du propriétaire n'est supprimé que s'il ne possède plus aucun établissement.
 * - sans organizationId : supprime le compte et tout ce qu'il possède.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireSuperadmin(req);
  if ('response' in ctx) return ctx.response;
  const { admin } = ctx;

  let body: { ownerId?: string; organizationId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });
  }

  const { ownerId, organizationId } = body;
  if (!ownerId) {
    return NextResponse.json({ error: 'ID du propriétaire manquant' }, { status: 400 });
  }
  if (ownerId === ctx.userId) {
    return NextResponse.json({ error: 'Impossible de supprimer votre propre compte' }, { status: 400 });
  }

  try {
    const { data: target, error: targetError } = await admin
      .from('users').select('is_superadmin').eq('id', ownerId).maybeSingle();
    check('Profil', targetError);
    if (target?.is_superadmin) {
      return NextResponse.json({ error: 'Impossible de supprimer un compte superadmin' }, { status: 400 });
    }

    if (organizationId) {
      const { data: orgBiz, error } = await admin
        .from('businesses').select('id').eq('organization_id', organizationId);
      check('Établissements', error);
      await deleteBusinesses(admin, (orgBiz ?? []).map((b) => b.id));
      check('Organisation', (await admin.from('organizations').delete().eq('id', organizationId)).error);

      const { count, error: countError } = await admin
        .from('businesses').select('id', { count: 'exact', head: true }).eq('owner_id', ownerId);
      check('Établissements restants', countError);
      if ((count ?? 0) > 0) return NextResponse.json({ ok: true, accountDeleted: false });
    }

    // Suppression complète du compte
    const { data: allBiz, error: bizError } = await admin
      .from('businesses').select('id').eq('owner_id', ownerId);
    check('Établissements', bizError);
    await deleteBusinesses(admin, (allBiz ?? []).map((b) => b.id));

    // analytics_events.user_id référence auth.users(id) sans ON DELETE, et les
    // événements d'onboarding (signup_started...) sont capturés avant la
    // création du business (business_id NULL) : un filtre par business_id les
    // rate et laisse une ligne qui bloque auth.admin.deleteUser() plus bas.
    check('Analytics', (await admin.from('analytics_events').delete().eq('user_id', ownerId)).error);
    check('Organisations', (await admin.from('organizations').delete().eq('owner_id', ownerId)).error);
    check('Profil', (await admin.from('users').delete().eq('id', ownerId)).error);

    // Supprimer le compte Auth (plus de données dépendantes à ce stade)
    const { error: deleteError } = await admin.auth.admin.deleteUser(ownerId);
    check('Compte Auth', deleteError);

    return NextResponse.json({ ok: true, accountDeleted: true });
  } catch (err) {
    console.error('[delete-account]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
