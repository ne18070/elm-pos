import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

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
