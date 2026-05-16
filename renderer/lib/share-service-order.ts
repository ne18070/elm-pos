'use client';
import { formatCurrency } from './utils';
import { generateServiceOrderPdf } from './pdf-utils';
import { supabase } from './supabase';
import { getPublicSiteUrl } from './public-links';
import { triggerWhatsAppShare } from './whatsapp-direct';
import { getOrCreateTrackingToken } from '@services/supabase/client-tracking';
import type { Business } from '@pos-types';
import type { ServiceOrder } from '@services/supabase/service-orders';

/** Génère l'URL de suivi public */
function getTrackingUrl(token: string): string {
  return `${getPublicSiteUrl()}/track/${token}`;
}

/** Génère le PDF de l'OT, l'uploade et retourne l'URL publique */
export async function generateServiceOrderLink(
  order: ServiceOrder,
  business: Business
): Promise<string> {
  const orderRef = `OT-${String(order.order_number).padStart(4, '0')}`;
  const pdfBlob = await generateServiceOrderPdf(order, business);
  const filename = `${orderRef}.pdf`;
  const filePath = `services/${business.id}/${order.id}/${filename}`;

  // Nettoyage avant upload
  await supabase.storage.from('product-images').remove([filePath]).catch(() => {});

  const { error: uploadError } = await supabase.storage
    .from('product-images')
    .upload(filePath, pdfBlob, { upsert: false, contentType: 'application/pdf' });

  if (uploadError) throw uploadError;

  const { data: signed, error: signErr } = await supabase.storage
    .from('product-images')
    .createSignedUrl(filePath, 60 * 60 * 24 * 7); // valide 7 jours
  if (signErr || !signed?.signedUrl) throw signErr ?? new Error('Impossible de créer le lien signé');
  return signed.signedUrl;
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

    let trackingUrl = '';
    if (options.includeTracking || options.type === 'tracking') {
      const token = await getOrCreateTrackingToken(
        business.id,
        order.id,
        'service_order',
        order.client_phone
      );
      trackingUrl = getTrackingUrl(token);
    }

    let message = '';
    const greeting = order.client_name ? `Bonjour ${order.client_name},` : 'Bonjour,';

    if (options.type === 'receipt') {
      message = `${greeting} voici le reçu pour votre prestation *${orderRef}* 🧾\n\n` +
                `🔗 Télécharger le PDF : ${publicUrl}\n\n` +
                `Merci pour votre confiance ! 🙏`;
    } else if (options.type === 'tracking') {
      message = `${greeting} voici le lien pour suivre votre prestation *${orderRef}* 📍\n\n` +
                `${trackingUrl}\n\n` +
                `Une fois votre service terminé, n'oubliez pas de laisser votre avis ⭐ — votre retour nous aide à mieux vous servir !\n\n` +
                `À bientôt chez *${business.name}* !`;
    } else {
      // status_update
      let statusText = '';
      if (order.status === 'en_cours') statusText = 'est maintenant *en cours de traitement* 🛠️';
      else if (order.status === 'termine') statusText = 'est désormais *terminé* ! ✅ Vous pouvez passer le récupérer.';
      else if (order.status === 'paye') statusText = 'a été réglé. Merci ! 💰';
      
      message = `${greeting} votre service *${orderRef}* ${statusText}\n\n` +
                (trackingUrl ? `Suivi : ${trackingUrl}\n\n` : '') +
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
