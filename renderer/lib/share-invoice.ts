/**
 * Partage de factures
 * - WhatsApp via wa.me (fallback text)
 * - WhatsApp via Business API (PDF)
 */

import { formatCurrency } from './utils';
import { generateThermalReceipt } from './invoice-templates';
import { htmlToPdfBlob } from './pdf-utils';
import { getWhatsAppConfig, sendWhatsAppDocument } from '@services/supabase/whatsapp';
import { supabase } from './supabase';
import type { Order, Business } from '@pos-types';

/** Normalise un numéro de téléphone pour wa.me (chiffres uniquement, sans +) */
function toWhatsAppNumber(phone: string): string {
  let n = phone.replace(/[^\d+]/g, '');
  if (n.startsWith('0') && !n.startsWith('00')) {
    n = '221' + n.slice(1);
  }
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

/**
 * Génère le PDF de la facture, l'uploade sur Supabase Storage et retourne l'URL publique.
 */
export async function generateInvoiceLink(
  order: Order,
  business: Business
): Promise<string> {
  const orderRef = order.id.slice(0, 8).toUpperCase();
  const html = generateThermalReceipt(order, business);
  const pdfBlob = await htmlToPdfBlob(html);
  const filename = `facture-${orderRef}.pdf`;
  const filePath = `${business.id}/${order.id}/${filename}`;

  const { error: uploadError } = await supabase.storage
    .from('product-images')
    .upload(filePath, pdfBlob, { upsert: true, contentType: 'application/pdf' });

  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage
    .from('product-images')
    .getPublicUrl(filePath);

  return publicUrl;
}

/**
 * Génère le PDF de la facture, l'uploade sur Supabase Storage et l'envoie via WhatsApp Business API.
 * Si l'API n'est pas configurée, bascule sur l'ouverture de l'application avec le lien PDF.
 */
export async function sendInvoiceViaWhatsApp(
  order: Order,
  business: Business,
  userId: string,
  targetPhone?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const phone = targetPhone || order.customer_phone;
    if (!phone) throw new Error('Numéro de téléphone manquant');

    const publicUrl = await generateInvoiceLink(order, business);
    const orderRef = order.id.slice(0, 8).toUpperCase();
    const filename = `facture-${orderRef}.pdf`;

    // 2. Vérifier la config API Meta
    const config = await getWhatsAppConfig(business.id);

    if (config && config.is_active) {
      // OPTION A : Envoi direct via API Meta (Silencieux pour l'utilisateur)
      await sendWhatsAppDocument(
        config,
        phone,
        publicUrl,
        filename,
        `Votre facture ${business.name}`,
        userId
      );
      return { success: true };
    } else {
      // OPTION B : Partage via l'application locale (Ouvre WhatsApp)
      const greeting  = order.customer_name ? `Bonjour ${order.customer_name},` : 'Bonjour,';
      const text = encodeURIComponent(
        `${greeting} voici votre facture n° *${orderRef}* 🧾\n\n` +
        `🔗 Télécharger le PDF : ${publicUrl}\n\n` +
        `Merci pour votre confiance ! 🙏`
      );

      const url = `https://wa.me/${toWhatsAppNumber(phone)}?text=${text}`;
      window.open(url, '_blank', 'noopener,noreferrer');
      
      return { success: true };
    }
  } catch (err: any) {
    console.error('WhatsApp share failed:', err);
    return { success: false, error: err.message };
  }
}
