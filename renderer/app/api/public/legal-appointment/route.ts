import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

function makeReference() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RDV-${y}${m}${d}-${suffix}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      business_id,
      client_name,
      client_phone,
      client_email,
      subject,
      preferred_date,
      notes,
    } = body ?? {};

    if (!business_id || !client_name || !client_phone || !subject || !preferred_date) {
      return NextResponse.json(
        { error: 'Champs obligatoires manquants.' },
        { status: 400 },
      );
    }

    const admin = getSupabaseAdmin();

    // Formulaire public : limiter les rafales (5 / h par IP, 3 / h par téléphone et cabinet)
    const ip    = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const phone = String(client_phone).replace(/\D/g, '');
    for (const [key, max] of [
      ...(ip ? [[`legal_rdv_ip:${ip}`, 5] as const] : []),
      [`legal_rdv_phone:${business_id}:${phone}`, 3] as const,
    ]) {
      const { data: allowed } = await admin.rpc('check_rate_limit', { p_key: key, p_max_count: max, p_window_seconds: 3600 });
      if (allowed === false) {
        return NextResponse.json(
          { error: 'Trop de demandes en peu de temps. Réessayez plus tard ou appelez le cabinet.' },
          { status: 429 },
        );
      }
    }

    // Verify the business exists before inserting — prevents submitting to arbitrary IDs
    const { data: biz } = await admin
      .from('businesses')
      .select('id')
      .eq('id', business_id)
      .maybeSingle();
    if (!biz) {
      return NextResponse.json({ error: 'Business introuvable.' }, { status: 404 });
    }

    const reference = makeReference();
    const payload = {
      business_id,
      reference,
      type_affaire: subject,
      client_name: String(client_name).trim(),
      client_phone: String(client_phone).trim(),
      client_email: client_email ? String(client_email).trim() : null,
      adversaire: null,
      tribunal: null,
      juge: null,
      status: 'ouvert',
      description: [
        '[RENDEZ-VOUS PUBLIC]',
        `Motif: ${String(subject).trim()}`,
        `Date souhaitée: ${preferred_date}`,
        notes ? `Notes: ${String(notes).trim()}` : null,
      ].filter(Boolean).join('\n'),
      date_ouverture: new Date().toISOString().slice(0, 10),
      date_audience: preferred_date,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await admin
      .from('dossiers')
      .insert(payload)
      .select('id, reference')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: 'Impossible de créer le rendez-vous.' },
      { status: 500 },
    );
  }
}
