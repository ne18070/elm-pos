import { NextRequest } from 'next/server';
import { createAndPayPublicRequest } from '@/lib/server/paydunya';

export const runtime = 'nodejs';

// Route interne (même origine) utilisée uniquement par /subscribe — pas de clé
// API requise ici puisqu'il ne s'agit pas d'un appel d'application externe.
// Le montant est TOUJOURS résolu côté serveur depuis la table plans, jamais
// depuis le corps de la requête. Redirige vers la page de paiement hébergée
// PayDunya (tous moyens de paiement inclus).
//
// La ligne public_subscription_requests est créée ICI, dans le même appel que
// la facturation PayDunya : si PayDunya échoue, la ligne est supprimée
// aussitôt plutôt que de laisser une demande fantôme dans le backoffice.

interface Body {
  business_name:  string;
  denomination?:  string;
  full_name:      string;
  email:          string;
  phone?:         string;
  plan_id:        string;
}

export async function POST(request: NextRequest) {
  try {
    let body: Body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    if (!body.business_name?.trim()) return Response.json({ error: '"business_name" is required.' }, { status: 400 });
    if (!body.full_name?.trim()) return Response.json({ error: '"full_name" is required.' }, { status: 400 });
    if (!body.email?.trim()) return Response.json({ error: '"email" is required.' }, { status: 400 });
    if (!body.plan_id) return Response.json({ error: '"plan_id" is required.' }, { status: 400 });

    const result = await createAndPayPublicRequest({
      businessName: body.business_name.trim(),
      denomination: body.denomination?.trim() || null,
      fullName: body.full_name.trim(),
      email: body.email.trim().toLowerCase(),
      phone: body.phone?.trim() || null,
      planId: body.plan_id,
      origin: request.nextUrl.origin,
    });

    return Response.json({ data: result });
  } catch (err) {
    const e = err as { status?: number; message?: string };
    return Response.json({ error: e.message ?? 'Erreur interne.' }, { status: e.status ?? 500 });
  }
}
