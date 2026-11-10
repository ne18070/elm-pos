import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin } from '@/lib/admin-auth';
import { check, deleteBusinesses } from '@/lib/admin-delete';

export const runtime = 'nodejs';

/**
 * Superadmin. Supprime une structure sans compte rattaché — aucun compte utilisateur n'est touché.
 * POST { organizationId } : organisation SANS propriétaire, avec tous ses établissements.
 * POST { businessId }     : établissement orphelin (sans organisation).
 * Une organisation qui a un propriétaire passe par /api/admin/delete-account.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireSuperadmin(req);
  if ('response' in ctx) return ctx.response;
  const { admin } = ctx;

  const body = await req.json().catch(() => null) as { organizationId?: string; businessId?: string } | null;
  const { organizationId, businessId } = body ?? {};
  if (!organizationId === !businessId) {
    return NextResponse.json({ error: 'Indiquer organizationId ou businessId' }, { status: 400 });
  }

  try {
    if (organizationId) {
      const { data: org, error } = await admin
        .from('organizations').select('id, owner_id').eq('id', organizationId).maybeSingle();
      check('Organisation', error);
      if (!org) return NextResponse.json({ error: 'Organisation introuvable' }, { status: 404 });
      if (org.owner_id) {
        return NextResponse.json({ error: 'Cette organisation a un propriétaire : supprimez-la avec son compte.' }, { status: 409 });
      }

      const { data: orgBiz, error: bizError } = await admin
        .from('businesses').select('id').eq('organization_id', organizationId);
      check('Établissements', bizError);
      await deleteBusinesses(admin, (orgBiz ?? []).map((b) => b.id));
      check('Organisation', (await admin.from('organizations').delete().eq('id', organizationId)).error);
      return NextResponse.json({ ok: true, deletedBusinesses: orgBiz?.length ?? 0 });
    }

    const { data: biz, error } = await admin
      .from('businesses').select('id, organization_id').eq('id', businessId!).maybeSingle();
    check('Établissement', error);
    if (!biz) return NextResponse.json({ error: 'Établissement introuvable' }, { status: 404 });
    if (biz.organization_id) {
      return NextResponse.json({ error: 'Cet établissement est rattaché à une organisation.' }, { status: 409 });
    }
    await deleteBusinesses(admin, [biz.id]);
    return NextResponse.json({ ok: true, deletedBusinesses: 1 });
  } catch (err) {
    console.error('[delete-structure]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
