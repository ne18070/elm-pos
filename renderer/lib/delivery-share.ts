import { getPublicSiteUrl } from '@/lib/public-links';
import { isMobileDevice, triggerWhatsAppShare } from '@/lib/whatsapp-direct';

/**
 * Lien de préparation d'une commande, à envoyer au magasinier. Il ouvre
 * `/livraison` sur la commande (connexion requise : le magasinier a son
 * compte, avec l'accès « Suivi livraisons » ; après connexion il revient sur
 * ce lien grâce à `?next=`). Adresse publique du site, jamais l'origine
 * Electron ou localhost, que son téléphone ne saurait pas ouvrir.
 */
export function deliveryLink(orderId: string): string {
  return `${getPublicSiteUrl()}/livraison?order=${encodeURIComponent(orderId)}`;
}

export interface DeliveryShareInput {
  orderId: string;
  customerName?: string | null;
  itemCount?: number;
}

function message({ orderId, customerName, itemCount }: DeliveryShareInput): string {
  const lines = [`📦 Commande #${orderId.slice(0, 8).toUpperCase()} à préparer`];
  if (customerName) lines.push(`Client : ${customerName}`);
  if (itemCount) lines.push(`${itemCount} article${itemCount > 1 ? 's' : ''}`);
  lines.push('', `Ouvrir : ${deliveryLink(orderId)}`);
  return lines.join('\n');
}

/**
 * Envoie le lien au magasinier : feuille de partage native sur téléphone
 * (WhatsApp, SMS…), WhatsApp (choix du contact) ailleurs.
 */
export async function shareDeliveryLink(input: DeliveryShareInput): Promise<void> {
  const text = message(input);
  if (isMobileDevice() && typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch (e) {
      // Partage annulé par l'utilisateur : rien à faire
      if (e instanceof DOMException && e.name === 'AbortError') return;
    }
  }
  triggerWhatsAppShare(null, text);
}
