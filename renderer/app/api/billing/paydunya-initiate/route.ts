import { NextRequest } from 'next/server';
import { createAndPayExistingBusinessRequest } from '@/lib/server/paydunya';

export const runtime = 'nodejs';

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
