import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendFcm, isFcmConfigured } from '@/lib/fcm';

export const runtime = 'nodejs';

/**
 * Notification « App liée » envoyée au client juste après le scan de son code au
 * comptoir (partner_link_client_app, migration 178) : il la voit arriver devant le
 * technicien, preuve que les prochains ordres lui parviendront.
 *
 * Appelée par l'espace partenaire de l'app ELM Boutique (Bearer de session).
 * Le texte est fixé ici — jamais pris dans la requête.
 */
export async function POST(req: NextRequest) {
  const { linkId } = await req.json().catch(() => ({}));
  if (typeof linkId !== 'string') {
    return NextResponse.json({ error: 'Missing linkId' }, { status: 400 });
  }

  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const admin = getSupabaseAdmin();
  const { data: { user } } = await admin.auth.getUser(auth.slice(7));
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { data: link } = await admin
    .from('client_app_links')
    .select('id, business_id, device_id, client_app_devices(fcm_token), businesses(name)')
    .eq('id', linkId)
    .maybeSingle();
  if (!link) return NextResponse.json({ error: 'Liaison introuvable' }, { status: 404 });

  // Mêmes rôles que les RPC de liaison (owner / admin / manager), définis en SQL
  const { data: isManager } = await admin.rpc('_is_client_app_manager', {
    p_business_id: link.business_id,
    p_user_id: user.id,
  });
  if (isManager !== true) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

  const business = link.businesses as unknown as { name: string } | null;

  const device = link.client_app_devices as unknown as { fcm_token: string | null } | null;
  if (!device?.fcm_token || !isFcmConfigured()) {
    return NextResponse.json({ ok: true, sent: false });
  }

  // Une seule notification par scan, dans les 2 minutes qui le suivent : un
  // double tap, une relance ou un script ne renvoient rien
  const { data: claimed } = await admin.rpc('claim_client_app_link_notification', { p_link_id: link.id });
  if (claimed !== true) {
    return NextResponse.json({ ok: true, sent: false, skipped: 'already notified or stale' });
  }

  const result = await sendFcm(device.fcm_token, {
    title: '✅ App liée',
    body: `Vous recevrez ici l'avancement de vos ordres de travail chez ${business?.name || 'votre prestataire'}.`,
    // Pas de lien : le toucher ouvre simplement l'app
    url: '',
    tag: `link-${link.id}`,
  });
  // Jeton mort : on l'efface, sinon has_push et le badge « notifié par push »
  // annonceraient des notifications qui n'arriveront jamais
  if (result === 'unregistered') {
    await admin
      .from('client_app_devices')
      .update({ fcm_token: null })
      .eq('id', link.device_id)
      .eq('fcm_token', device.fcm_token);
  }
  return NextResponse.json({ ok: true, sent: result === 'sent', ...(result === 'unregistered' ? { unregistered: true } : {}) });
}
