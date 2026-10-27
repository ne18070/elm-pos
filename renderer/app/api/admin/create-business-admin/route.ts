import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin } from '@/lib/admin-auth';

export const runtime = 'nodejs';

const ROLES = ['owner', 'admin', 'manager', 'staff'] as const;

// POST /api/admin/create-business-admin — crée un compte et l'attache à un établissement
export async function POST(req: NextRequest) {
  const ctx = await requireSuperadmin(req);
  if ('response' in ctx) return ctx.response;
  const { admin } = ctx;

  let body: { business_id?: string; email?: string; password?: string; full_name?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });
  }

  const email    = body.email?.trim().toLowerCase();
  const fullName = body.full_name?.trim();
  const role     = body.role ?? 'owner';
  if (!body.business_id || !email || !fullName || !body.password) {
    return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 });
  }
  if (body.password.length < 8) {
    return NextResponse.json({ error: 'Le mot de passe doit contenir au moins 8 caractères' }, { status: 400 });
  }
  if (!(ROLES as readonly string[]).includes(role)) {
    return NextResponse.json({ error: 'Rôle invalide' }, { status: 400 });
  }

  // 1. Créer l'utilisateur Auth
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password:      body.password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role, business_id: body.business_id },
  });
  if (authError || !authData.user) {
    return NextResponse.json({ error: authError?.message ?? 'Création du compte impossible' }, { status: 400 });
  }
  const userId = authData.user.id;

  try {
    // 2. Profil public (le trigger handle_new_user s'en occupe normalement)
    const { error: profileError } = await admin.from('users').upsert({
      id: userId, email, full_name: fullName, role, business_id: body.business_id,
    });
    if (profileError) throw new Error(profileError.message);

    // 3. Membre de l'établissement
    const { error: memberError } = await admin.from('business_members').upsert({
      business_id: body.business_id, user_id: userId, role,
    });
    if (memberError) throw new Error(memberError.message);

    // 4. Owner → businesses.owner_id
    if (role === 'owner') {
      const { error: bizError } = await admin
        .from('businesses').update({ owner_id: userId }).eq('id', body.business_id);
      if (bizError) throw new Error(bizError.message);
    }

    return NextResponse.json({ ok: true, userId });
  } catch (err) {
    // Annuler la création pour qu'un nouvel essai avec le même email reste possible
    await admin.from('business_members').delete().eq('user_id', userId);
    await admin.from('users').delete().eq('id', userId);
    await admin.auth.admin.deleteUser(userId);
    console.error('[create-business-admin]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
