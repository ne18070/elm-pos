import { NextRequest } from 'next/server';
import { getTransactionByReference } from '@/lib/server/paydunya';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const ref = request.nextUrl.searchParams.get('ref');
  if (!ref) return Response.json({ error: '"ref" is required.' }, { status: 400 });

  try {
    const tx = await getTransactionByReference(ref);
    if (!tx) return Response.json({ data: { status: 'pending' } });
    return Response.json({ data: { status: tx.status, invoice_token: tx.invoice_token } });
  } catch (err) {
    const e = err as { message?: string };
    return Response.json({ error: e.message ?? 'Erreur interne.' }, { status: 500 });
  }
}
