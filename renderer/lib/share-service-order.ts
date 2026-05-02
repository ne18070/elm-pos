import { formatCurrency } from './utils';
import { generateServiceOrderReceipt } from './invoice-templates';
import { htmlToPdfBlob } from './pdf-utils';
import { supabase } from './supabase';
import { buildPublicDocumentUrl } from './public-links';
import { triggerWhatsAppShare } from './whatsapp-direct';
import type { Business } from '@pos-types';
import type { ServiceOrder } from '@services/supabase/service-orders';

/** Génère l'URL de suivi public */
function getTrackingUrl(token: string): string {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  return `${baseUrl}/track/${token}`;
}

/** Génère le PDF de l'OT, l'uploade et retourne l'URL publique */
export async function generateServiceOrderLink(
  order: ServiceOrder,
  business: Business
): Promise<string> {
  const orderRef = `OT-${String(order.order_number).padStart(4, '0')}`;
  
  const receiptData = {
    id:              order.id,
    order_number:    order.order_number,
    created_at:      order.created_at,
    subject_ref:     order.subject_ref,
    subject_info:    order.subject_info,
    client_name:     order.client_name,
    client_phone:    order.client_phone,
    status:          order.status,
    notes:           order.notes,
    items:           (order.items ?? []).map(i => ({ name: i.name, price: i.price, quantity: i.quantity, total: i.total })),
    total:           order.total,
    paid_amount:     order.paid_amount,
    payment_method:  order.payment_method,
    payments:        order.payments?.map(p => ({ amount: p.amount, method: p.method, paid_at: p.paid_at })),
  };

  const html = generateServiceOrderReceipt(receiptData, business);
  const pdfBlob = await htmlToPdfBlob(html);
  const filename = `${orderRef}.pdf`;
  const filePath = `services/${business.id}/${order.id}/${filename}`;

  // Nettoyage avant upload
  await supabase.storage.from('product-images').remove([filePath]).catch(() => {});

  const { error: uploadError } = await supabase.storage
    .from('product-images')
    .upload(filePath, pdfBlob, { upsert: false, contentType: 'application/pdf' });

  if (uploadError) throw uploadError;

  return buildPublicDocumentUrl(filePath);
}

/** Partage de l'OT ou du reçu via WhatsApp (MODE DIRECT SIMPLE) */
export async function shareServiceOrderViaWhatsApp(
  order: ServiceOrder,
  business: Business,
  _userId: string,
  options: { includeTracking?: boolean; type: 'receipt' | 'tracking' | 'status_update' }
): Promise<{ success: boolean; error?: string }> {
  try {
    const phone = order.client_phone;
    if (!phone) throw new Error('Numéro de téléphone du client manquant');

    const orderRef = `OT-${String(order.order_number).padStart(4, '0')}`;
    
    // 1. Récupérer l'URL du PDF si nécessaire
    let publicUrl = '';
    if (options.type === 'receipt') {
      publicUrl = await generateServiceOrderLink(order, business);
    }

    let message = '';
    const greeting = order.client_name ? `Bonjour ${order.client_name},` : 'Bonjour,';

    if (options.type === 'receipt') {
      message = `${greeting} voici le reçu pour votre prestation *${orderRef}* 🧾\n\n` +
                `🔗 Télécharger le PDF : ${publicUrl}\n\n` +
                `Merci pour votre confiance ! 🙏`;
    } else if (options.type === 'tracking') {
      message = `${greeting} voici le lien pour suivre votre prestation *${orderRef}* 📍\n\n` +
                `${window.location.origin}/track/${order.id}\n\n` +
                `À bientôt chez *${business.name}* !`;
    } else {
      // status_update
      let statusText = '';
      if (order.status === 'en_cours') statusText = 'est maintenant *en cours de traitement* 🛠️';
      else if (order.status === 'termine') statusText = 'est désormais *terminé* ! ✅ Vous pouvez passer le récupérer.';
      else if (order.status === 'paye') statusText = 'a été réglé. Merci ! 💰';
      
      message = `${greeting} votre service *${orderRef}* ${statusText}\n\n` +
                `À bientôt chez *${business.name}* !`;
    }

    // 2. OUVERTURE DIRECTE VIA HELPER
    triggerWhatsAppShare(phone, message);

    return { success: true };
  } catch (err: any) {
    console.error('WhatsApp share failed:', err);
    return { success: false, error: err.message };
  }
}
