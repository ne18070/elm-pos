import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireSuperadmin } from '@/lib/admin-auth';

export const runtime = 'nodejs';

// Supabase Auth n'a pas de ban illimité : 100 ans.
const BAN_FOREVER = '876000h';

/**
 * Bannit (ou rétablit) les comptes rattachés à l'organisation : propriétaire et
 * membres de ses établissements. Un compte n'est banni que si TOUTES ses
 * organisations sont bloquées — un employé qui travaille aussi pour une autre
 * structure garde son accès. Les superadmins ne sont jamais touchés.
 * Ne modifie aucune donnée métier : seul l'état de connexion change.
 */
async function syncMemberBans(admin: SupabaseClient, organizationId: string) {
  const [{ data: org, error: orgErr }, { data: orgBiz, error: bizErr }] = await Promise.all([
    admin.from('organizations').select('owner_id').eq('id', organizationId).maybeSingle(),
    admin.from('businesses').select('id').eq('organization_id', organizationId),
  ]);
  if (orgErr) throw new Error(orgErr.message);
  if (bizErr) throw new Error(bizErr.message);

  const orgBizIds = (orgBiz ?? []).map((b) => b.id as string);
  const { data: orgMembers, error: membersErr } = orgBizIds.length
    ? await admin.from('business_members').select('user_id').in('business_id', orgBizIds)
    : { data: [], error: null };
  if (membersErr) throw new Error(membersErr.message);

  const userIds = [...new Set([
    ...(orgMembers ?? []).map((m) => m.user_id as string),
    ...(org?.owner_id ? [org.owner_id as string] : []),
  ])];
  if (userIds.length === 0) return { banned: 0, restored: 0 };

  const [supers, memberships, owned, blocks] = await Promise.all([
    admin.from('users').select('id').in('id', userIds).eq('is_superadmin', true),
    admin.from('business_members').select('user_id, business_id').in('user_id', userIds),
    admin.from('organizations').select('id, owner_id').in('owner_id', userIds),
    admin.from('organization_blocks').select('organization_id'),
  ]);
  for (const r of [supers, memberships, owned, blocks]) if (r.error) throw new Error(r.error.message);

  const allBizIds = [...new Set((memberships.data ?? []).map((m) => m.business_id as string))];
  const { data: allBiz, error: allBizErr } = allBizIds.length
    ? await admin.from('businesses').select('id, organization_id').in('id', allBizIds)
    : { data: [], error: null };
  if (allBizErr) throw new Error(allBizErr.message);

  const superIds   = new Set((supers.data ?? []).map((u) => u.id as string));
  const blockedOrg = new Set((blocks.data ?? []).map((b) => b.organization_id as string));
  const bizOrg     = new Map((allBiz ?? []).map((b) => [b.id as string, b.organization_id as string | null]));

  let banned = 0;
  let restored = 0;
  const failures: string[] = [];

  for (const userId of userIds) {
    if (superIds.has(userId)) continue;

    // Organisations du compte (null = établissement sans organisation, jamais bloqué)
    const orgs: (string | null)[] = [
      ...(memberships.data ?? []).filter((m) => m.user_id === userId).map((m) => bizOrg.get(m.business_id as string) ?? null),
      ...(owned.data ?? []).filter((o) => o.owner_id === userId).map((o) => o.id as string),
    ];
    const shouldBan = orgs.length > 0 && orgs.every((id) => id !== null && blockedOrg.has(id));

    const { error } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: shouldBan ? BAN_FOREVER : 'none',
    });
    if (error) failures.push(error.message);
    else if (shouldBan) banned++;
    else restored++;
  }

  if (failures.length) throw new Error(`Comptes non mis à jour (${failures.length}) : ${failures[0]}`);
  return { banned, restored };
}

export async function POST(req: NextRequest) {
  const ctx = await requireSuperadmin(req);
  if ('response' in ctx) return ctx.response;
  const { admin, userId } = ctx;

  let body: { organizationId?: string; blocked?: boolean; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });
  }

  const { organizationId, blocked } = body;
  if (!organizationId || typeof blocked !== 'boolean') {
    return NextResponse.json({ error: 'organizationId et blocked requis' }, { status: 400 });
  }
  const reason = body.reason?.trim().slice(0, 500) || null;

  const { data: org, error: orgErr } = await admin
    .from('organizations').select('id').eq('id', organizationId).maybeSingle();
  if (orgErr) return NextResponse.json({ error: orgErr.message }, { status: 500 });
  if (!org) return NextResponse.json({ error: 'Organisation introuvable' }, { status: 404 });

  const { error: writeErr } = blocked
    ? await admin.from('organization_blocks').upsert(
        { organization_id: organizationId, reason, blocked_by: userId },
        { onConflict: 'organization_id' },
      )
    : await admin.from('organization_blocks').delete().eq('organization_id', organizationId);
  if (writeErr) return NextResponse.json({ error: writeErr.message }, { status: 500 });

  try {
    const result = await syncMemberBans(admin, organizationId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[organization-block]', err);
    // Le blocage/déblocage est enregistré ; un nouveau clic relance la synchro des comptes.
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
