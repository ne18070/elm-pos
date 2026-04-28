import { formatCurrency } from './utils';
import { generateServiceOrderReceipt } from './invoice-templates';
import { htmlToPdfBlob } from './pdf-utils';
import { getWhatsAppConfig, sendWhatsAppReply } from '@services/supabase/whatsapp';
import { getOrCreateTrackingToken } from '@services/supabase/client-tracking';
import { supabase } from './supabase';
import { buildPublicDocumentUrl } from './public-links';
import type { Business } from '@pos-types';
import type { ServiceOrder } from '@services/supabase/service-orders';

/** Normalise un numéro de téléphone pour wa.me */
function toWhatsAppNumber(phone: string): string {
  let n = phone.replace(/[^\d+]/g, '');
  if (n.startsWith('0') && !n.startsWith('00')) {
    n = '221' + n.slice(1);
  }
  return n.replace(/^\+/, '');
}

/** Génère l'URL de suivi public */
function getTrackingUrl(token: string): string {
  // En production, on utiliserait le domaine de l'app. 
  // En Electron, on peut pointer vers une page web si elle existe.
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
  };

  const html = generateServiceOrderReceipt(receiptData, business);
  const pdfBlob = await htmlToPdfBlob(html);
  const filename = `${orderRef}.pdf`;
  const filePath = `services/${business.id}/${order.id}/${filename}`;

  const { error: uploadError } = await supabase.storage
    .from('product-images') // On réutilise le bucket existant ou on en créerait un 'documents'
    .upload(filePath, pdfBlob, { upsert: true, contentType: 'application/pdf' });

  if (uploadError) throw uploadError;

  return buildPublicDocumentUrl(filePath);
}

/** Partage de l'OT ou du reçu via WhatsApp */
export async function shareServiceOrderViaWhatsApp(
  order: ServiceOrder,
  business: Business,
  userId: string,
  options: { includeTracking?: boolean; type: 'receipt' | 'status_update' }
): Promise<{ success: boolean; error?: string }> {
  try {
    const phone = order.client_phone;
    if (!phone) throw new Error('Numéro de téléphone du client manquant');

    const orderRef = `OT-${String(order.order_number).padStart(4, '0')}`;
    const trackingToken = options.includeTracking ? await getOrCreateTrackingToken(business.id, order.id, phone) : null;
    const trackingUrl = trackingToken ? getTrackingUrl(trackingToken) : null;
    
    let message = '';
    const greeting = order.client_name ? `Bonjour ${order.client_name},` : 'Bonjour,';

    if (options.type === 'receipt') {
      const publicUrl = await generateServiceOrderLink(order, business);
      message = `${greeting} voici le reçu pour votre prestation *${orderRef}* 🧾\n\n` +
                `🔗 Télécharger le PDF : ${publicUrl}\n` +
                (trackingUrl ? `📍 Suivre l'avancement : ${trackingUrl}\n` : '') +
                `Merci pour votre confiance ! 🙏`;
    } else {
      // Notification de changement de statut
      let statusText = '';
      if (order.status === 'en_cours') statusText = 'est maintenant *en cours de traitement* 🛠️';
      else if (order.status === 'termine') statusText = 'est désormais *terminé* ! ✅ Vous pouvez passer le récupérer.';
      else if (order.status === 'paye') statusText = 'a été réglé. Merci ! 💰';
      
      message = `${greeting} votre service *${orderRef}* ${statusText}\n\n` +
                (trackingUrl ? `📍 Suivi en temps réel : ${trackingUrl}\n` : '') +
                `À bientôt chez *${business.name}* !`;
    }

    const config = await getWhatsAppConfig(business.id);
    if (config && config.is_active) {
       await sendWhatsAppReply(config, phone, message, userId);
    } else {
      const url = `https://wa.me/${toWhatsAppNumber(phone)}?text=${encodeURIComponent(message)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    }

    return { success: true };
  } catch (err: any) {
    console.error('WhatsApp share failed:', err);
    return { success: false, error: err.message };
  }
}
