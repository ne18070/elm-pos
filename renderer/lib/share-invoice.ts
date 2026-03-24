/**
 * Partage de factures
 * - WhatsApp via wa.me (fonctionne sur mobile ET desktop/WhatsApp Web)
 */

import { formatCurrency } from './utils';

/** Normalise un numéro de téléphone pour wa.me (chiffres uniquement, sans +) */
function toWhatsAppNumber(phone: string): string {
  // Supprimer tout sauf chiffres et +
  let n = phone.replace(/[^\d+]/g, '');
  // Sénégal : numéros locaux commençant par 0 → 221
  if (n.startsWith('0') && !n.startsWith('00')) {
    n = '221' + n.slice(1);
  }
  // Retirer le + initial (wa.me attend les chiffres bruts)
  return n.replace(/^\+/, '');
}

export interface WhatsAppOptions {
  phone?: string;
  orderRef: string;
  total?: number;
  currency?: string;
  customerName?: string;
}

/**
 * Ouvre WhatsApp (app mobile ou WhatsApp Web) avec un message pré-rempli.
 * Si `phone` est fourni, ouvre directement la conversation du client.
 */
export function openWhatsApp({
  phone,
  orderRef,
  total,
  currency,
  customerName,
}: WhatsAppOptions): void {
  const greeting   = customerName ? `Bonjour ${customerName},` : 'Bonjour,';
  const totalLine  = total != null && currency
    ? `\n*Total :* ${formatCurrency(total, currency)}`
    : '';
  const text = encodeURIComponent(
    `${greeting} veuillez trouver ci-joint votre facture n° *${orderRef}* 🧾${totalLine}\n\nMerci pour votre confiance ! 🙏`
  );

  const url = phone
    ? `https://wa.me/${toWhatsAppNumber(phone)}?text=${text}`
    : `https://wa.me/?text=${text}`;

  window.open(url, '_blank', 'noopener,noreferrer');
}
