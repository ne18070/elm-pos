import { NextRequest } from 'next/server';
import { corsHeaders } from '@/lib/api-v1-auth';
import {
  getPaydunyaSettings, assertValidProxyKey, getTransactionByToken, confirmInvoice, updateTransactionStatus,
} from '@/lib/server/paydunya';

export const runtime = 'nodejs';

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

/**
 * Statut d'un paiement PayDunya, par invoice_token.
 * ?live=1 force une vérification directe auprès de PayDunya plutôt que de lire
 * notre table locale (utile si le webhook IPN n'est pas encore arrivé).
 */
export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const settings = await getPaydunyaSettings();
    assertValidProxyKey(request, settings);

    const token = params.token;
    const live = request.nextUrl.searchParams.get('live') === '1';

    if (live) {
      const confirm = await confirmInvoice(settings, token);
      const finalStatus = confirm.status === 'pending' ? null : confirm.status;
      const tx = finalStatus ? await updateTransactionStatus(token, finalStatus, confirm.raw) : await getTransactionByToken(token);
      return Response.json(
        { data: { invoice_token: token, status: confirm.status, receipt_url: confirm.receiptUrl, transaction: tx } },
        { headers: corsHeaders() },
      );
    }

    const tx = await getTransactionByToken(token);
    if (!tx) return Response.json({ error: 'Transaction not found.' }, { status: 404, headers: corsHeaders() });

    return Response.json({ data: tx }, { headers: corsHeaders() });
  } catch (err) {
    const e = err as { status?: number; message?: string };
    return Response.json({ error: e.message ?? 'Internal server error.' }, { status: e.status ?? 500, headers: corsHeaders() });
  }
}
