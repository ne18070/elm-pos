import { NextRequest } from 'next/server';
import { createHash } from 'crypto';
import qs from 'qs';
import { getPaydunyaSettings, activeKeys, confirmInvoice, updateTransactionStatus, autoActivatePaidRequest } from '@/lib/server/paydunya';

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
      // demande (external_reference = son id), on marque la demande payée et
      // on active immédiatement l'abonnement (voir autoActivatePaidRequest) —
      // plus besoin d'une validation manuelle superadmin pour un paiement déjà
      // vérifié côté serveur.
      //
      // Restreint au provider 'paydunya-hosted-checkout' : c'est le seul flow
      // où le montant facturé est résolu côté serveur depuis plans.price (voir
      // payExistingRequest). Le proxy SOFTPAY externe (/api/payments/paydunya/
      // initiate) laisse l'appelant choisir amount et external_reference —
      // sans ce filtre, un détenteur de clé proxy pourrait régler un montant
      // arbitraire tout en réutilisant l'id d'une vraie demande d'abonnement
      // pour la faire activer.
      //
      // Pas de garde "déjà traité" ici basée sur le statut de la transaction :
      // ce champ peut déjà valoir 'completed' via /api/payments/paydunya/status
      // (?live=1) sans que l'activation n'ait jamais eu lieu. L'idempotence
      // réelle vit dans autoActivatePaidRequest, via une transition atomique
      // status 'pending' → 'approved' sur la ligne de demande elle-même.
      if (
        confirm.status === 'completed' &&
        tx?.external_reference &&
        tx.provider === 'paydunya-hosted-checkout'
      ) {
        await autoActivatePaidRequest(tx.external_reference, data.invoice.token);
      }
    }

    return Response.json({ received: true }, { status: 200 });
  } catch {
    // Ne jamais faire échouer la requête IPN (PayDunya retentera sinon) —
    // le statut sera de toute façon rattrapable via /status?live=1.
    return Response.json({ received: true, ignored: 'internal error' }, { status: 200 });
  }
}
