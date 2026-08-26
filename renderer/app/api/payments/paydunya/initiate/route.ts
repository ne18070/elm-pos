import { NextRequest } from 'next/server';
import { apiError, corsHeaders } from '@/lib/api-v1-auth';
import {
  getPaydunyaSettings, assertValidProxyKey, createInvoice, initiateSoftpay, recordTransaction,
  type SoftpayMethod,
} from '@/lib/server/paydunya';

export const runtime = 'nodejs';

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

interface InitiateBody {
  method:              'orange-money' | 'wave' | 'free-money' | 'expresso' | 'djamo';
  amount:              number;
  description:         string;
  customer_name:       string;
  customer_email:      string;
  customer_phone:      string;
  external_reference?: string;
  return_url?:         string;
  cancel_url?:         string;
}

const METHOD_MAP: Record<InitiateBody['method'], SoftpayMethod> = {
  'orange-money': 'orange-money-senegal',
  'wave':         'wave-senegal',
  'free-money':   'free-money-senegal',
  'expresso':     'expresso-senegal',
  'djamo':        'djamo-senegal',
};

export async function POST(request: NextRequest) {
  try {
    const settings = await getPaydunyaSettings();
    assertValidProxyKey(request, settings);

    let body: InitiateBody;
    try {
      body = await request.json();
    } catch {
      return apiError('Invalid JSON body.', 400);
    }

    if (!body.method || !METHOD_MAP[body.method]) {
      return apiError('"method" must be one of: orange-money, wave, free-money, expresso, djamo.', 400);
    }
    if (!body.amount || body.amount <= 0) return apiError('"amount" must be a positive number.', 400);
    if (!body.customer_name?.trim())  return apiError('"customer_name" is required.', 400);
    if (!body.customer_email?.trim()) return apiError('"customer_email" is required.', 400);
    if (!body.customer_phone?.trim()) return apiError('"customer_phone" is required.', 400);

    const provider = METHOD_MAP[body.method];
    const callbackUrl = new URL('/api/payments/paydunya/webhook', request.nextUrl.origin).toString();

    const invoice = await createInvoice(settings, {
      amount: body.amount,
      description: body.description || `Paiement ${body.amount} XOF`,
      externalReference: body.external_reference,
      returnUrl: body.return_url,
      cancelUrl: body.cancel_url,
      callbackUrl,
    });

    let softpay;
    try {
      softpay = await initiateSoftpay(settings, provider, invoice.token, {
        name:  body.customer_name.trim(),
        email: body.customer_email.trim(),
        phone: body.customer_phone.trim(),
      });
    } catch (softpayErr) {
      // La facture existe déjà côté PayDunya même si SOFTPAY est refusé ici —
      // on l'enregistre quand même (status 'pending' par défaut) pour que le
      // webhook retrouve la transaction si le client règle malgré tout via la
      // page PayDunya elle-même, plutôt que de laisser un paiement sans trace.
      await recordTransaction({
        external_reference: body.external_reference,
        invoice_token: invoice.token,
        provider,
        amount: body.amount,
        customer_name: body.customer_name.trim(),
        customer_email: body.customer_email.trim(),
        customer_phone: body.customer_phone.trim(),
        redirect_url: null,
        raw_initiate_response: { error: softpayErr instanceof Error ? softpayErr.message : String(softpayErr) },
      }).catch(() => {});
      throw softpayErr;
    }

    const tx = await recordTransaction({
      external_reference: body.external_reference,
      invoice_token: invoice.token,
      provider,
      amount: body.amount,
      customer_name: body.customer_name.trim(),
      customer_email: body.customer_email.trim(),
      customer_phone: body.customer_phone.trim(),
      redirect_url: softpay.redirectUrl ?? null,
      raw_initiate_response: softpay.raw,
    });

    return Response.json(
      {
        data: {
          transaction_id: tx.id,
          invoice_token:  invoice.token,
          status:         'pending',
          flow:           softpay.flow,
          redirect_url:   softpay.redirectUrl ?? null,
          om_url:         softpay.omUrl ?? null,
          maxit_url:      softpay.maxitUrl ?? null,
          message:        softpay.message,
        },
      },
      { headers: corsHeaders() },
    );
  } catch (err) {
    const e = err as { status?: number; message?: string };
    return Response.json({ error: e.message ?? 'Internal server error.' }, { status: e.status ?? 500, headers: corsHeaders() });
  }
}
