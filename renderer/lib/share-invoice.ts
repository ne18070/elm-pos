/**
 * Partage de factures
 * - WhatsApp via wa.me (fallback text)
 * - WhatsApp via Business API (PDF)
 */

import { formatCurrency } from './utils';
import { generateThermalReceipt } from './invoice-templates';
import { htmlToPdfBlob } from './pdf-utils';
import { supabase } from './supabase';
import { buildPublicDocumentUrl } from './public-links';
import { triggerWhatsAppShare } from './whatsapp-direct';
import type { Order, Business } from '@pos-types';

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
  const text = `${greeting} veuillez trouver ci-joint votre facture n° *${orderRef}* 🧾${totalLine}\n\nMerci pour votre confiance ! 🙏`;

  if (phone) {
    triggerWhatsAppShare(phone, text);
  } else {
    // Fallback sans numéro (ouvre WhatsApp pour choisir contact)
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  }
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

  return buildPublicDocumentUrl(filePath);
}

/**
 * Génère le PDF de la facture, l'uploade sur Supabase Storage et l'envoie via WhatsApp.
 * On privilégie le partage direct via l'application locale pour la simplicité.
 */
export async function sendInvoiceViaWhatsApp(
  order: Order,
  business: Business,
  _userId: string,
  targetPhone?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const phone = targetPhone || order.customer_phone;
    if (!phone) throw new Error('Numéro de téléphone manquant');

    const publicUrl = await generateInvoiceLink(order, business);
    const orderRef = order.id.slice(0, 8).toUpperCase();

    // Partage via l'application locale (Ouvre WhatsApp)
    const greeting  = order.customer_name ? `Bonjour ${order.customer_name},` : 'Bonjour,';
    const text = `${greeting} voici votre facture n° *${orderRef}* 🧾\n\n` +
      `🔗 Télécharger le PDF : ${publicUrl}\n\n` +
      `Merci pour votre confiance ! 🙏`;

    triggerWhatsAppShare(phone, text);
    
    return { success: true };
  } catch (err: any) {
    console.error('WhatsApp share failed:', err);
    return { success: false, error: err.message };
  }
}
