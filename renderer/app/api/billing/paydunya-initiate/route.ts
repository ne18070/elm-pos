import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createAndPayExistingBusinessRequest } from '@/lib/server/paydunya';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

/** Vérifie que le porteur du token est bien membre de business_id — sinon n'importe
 *  qui pourrait facturer un abonnement au nom d'une entreprise qui n'est pas la sienne. */
async function assertBusinessMember(request: NextRequest, businessId: string): Promise<void> {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) {
    throw Object.assign(new Error('Authentification requise.'), { status: 401 });
  }
  const token = auth.slice(7);
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  const { data: { user }, error } = await anon.auth.getUser(token);
  if (error || !user) throw Object.assign(new Error('Session invalide.'), { status: 401 });

  const admin = getSupabaseAdmin();
  const { data: membership } = await admin
    .from('business_members')
    .select('id')
    .eq('business_id', businessId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!membership) throw Object.assign(new Error("Vous n'êtes pas membre de cette entreprise."), { status: 403 });
}

// Route interne (même origine) utilisée uniquement par /billing (renouvellement
// d'un abonnement existant). Le montant est résolu côté serveur depuis la
// table plans — jamais depuis le corps de la requête. Redirige vers la page
// de paiement hébergée PayDunya (tous moyens de paiement, pas de SOFTPAY
// direct — évite le blocage KYC compte business).
//
// La ligne subscription_requests est créée ICI, dans le même appel que la
// facturation PayDunya : si PayDunya échoue, la ligne est supprimée aussitôt
// plutôt que de laisser une demande fantôme dans le backoffice.

interface Body {
  business_id:    string;
  plan_id:        string;
  customer_name:  string;
  customer_email: string;
  customer_phone: string;
}

export async function POST(request: NextRequest) {
  try {
    let body: Body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    if (!body.business_id) return Response.json({ error: '"business_id" is required.' }, { status: 400 });
    if (!body.plan_id) return Response.json({ error: '"plan_id" is required.' }, { status: 400 });
    if (!body.customer_phone?.trim()) return Response.json({ error: '"customer_phone" is required.' }, { status: 400 });

    await assertBusinessMember(request, body.business_id);

    const result = await createAndPayExistingBusinessRequest({
      businessId: body.business_id,
      planId: body.plan_id,
      customerName: body.customer_name?.trim() ?? '',
      customerEmail: body.customer_email?.trim() ?? '',
      customerPhone: body.customer_phone.trim(),
      origin: request.nextUrl.origin,
    });

    return Response.json({ data: result });
  } catch (err) {
    const e = err as { status?: number; message?: string };
    return Response.json({ error: e.message ?? 'Erreur interne.' }, { status: e.status ?? 500 });
  }
}
