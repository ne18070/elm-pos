import { NextRequest } from 'next/server';
import { createHash } from 'crypto';
import qs from 'qs';
import { getPaydunyaSettings, activeKeys, confirmInvoice, updateTransactionStatus } from '@/lib/server/paydunya';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

interface PaydunyaIpnData {
  hash?:   string;
  status?: 'completed' | 'failed' | 'cancelled';
  invoice?: { token?: string };
}

/**
 * Récepteur IPN PayDunya. Corps envoyé en application/x-www-form-urlencoded
 * avec notation PHP en crochets (data[status], data[invoice][token], ...),
 * d'où l'usage de `qs` pour reconstruire l'objet imbriqué.
 *
 * Le champ `hash` renvoyé est un SHA-512 statique de la master key (ne dépend
 * pas du contenu de la transaction) — il prouve seulement que l'appelant
 * connaît notre master key, pas l'intégrité du payload. On ne fait donc
 * confiance qu'au statut confirmé via un appel direct à PayDunya
 * (checkout-invoice/confirm), jamais au corps de la requête IPN seul.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  const parsed = qs.parse(raw) as { data?: PaydunyaIpnData };
  const data = parsed.data;

  if (!data?.invoice?.token || !data.hash) {
    // Toujours répondre 200 pour éviter que PayDunya ne retente indéfiniment
    // une notification malformée qu'on ne pourra de toute façon pas traiter.
    return Response.json({ received: true, ignored: 'missing token/hash' }, { status: 200 });
  }

  try {
    const settings = await getPaydunyaSettings();
    const masterKey = activeKeys(settings).master_key;
    if (!masterKey) return Response.json({ received: true, ignored: 'not configured' }, { status: 200 });

    const expectedHash = createHash('sha512').update(masterKey).digest('hex');
    if (data.hash !== expectedHash) {
      return Response.json({ received: true, ignored: 'invalid hash' }, { status: 200 });
    }

    const confirm = await confirmInvoice(settings, data.invoice.token);
    if (confirm.status !== 'pending') {
      const tx = await updateTransactionStatus(data.invoice.token, confirm.status, confirm.raw);

      // Cas /subscribe (public_subscription_requests) et /billing
      // (subscription_requests) : si cette transaction correspond à une
      // demande (external_reference = son id), on la marque payée. Chaque
      // update ne touche 0 ligne si l'id n'existe pas dans cette table-là —
      // jamais d'erreur, jamais bloquant pour l'accusé de réception IPN.
      if (confirm.status === 'completed' && tx?.external_reference) {
        const admin = getSupabaseAdmin();
        const patch = {
          payment_status: 'paid',
          paydunya_invoice_token: data.invoice.token,
          payment_confirmed_at: new Date().toISOString(),
        };
        await Promise.allSettled([
          admin.from('public_subscription_requests').update(patch).eq('id', tx.external_reference),
          admin.from('subscription_requests').update(patch).eq('id', tx.external_reference),
        ]);
      }
    }

    return Response.json({ received: true }, { status: 200 });
  } catch {
    // Ne jamais faire échouer la requête IPN (PayDunya retentera sinon) —
    // le statut sera de toute façon rattrapable via /status?live=1.
    return Response.json({ received: true, ignored: 'internal error' }, { status: 200 });
  }
}
