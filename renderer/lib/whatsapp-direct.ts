/**
 * Utility for direct WhatsApp sharing via wa.me links.
 * Handles mobile vs desktop differences to ensure reliability.
 */

/** Normalizes a phone number for wa.me (digits only, adding 221 if local) */
export function normalizeWhatsAppPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  let n = phone.replace(/[^\d+]/g, '');
  if (n.startsWith('0') && !n.startsWith('00')) {
    n = '221' + n.slice(1);
  }
  if (/^[37]\d{8}$/.test(n)) {
    n = '221' + n;
  }
  return n.replace(/^\+/, '');
}

/** 
 * Checks if the current device is mobile.
 */
export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

/**
 * Ouvre WhatsApp dans un nouvel onglet (wa.me).
 * Sur mobile le navigateur redirige vers l'app ; sur desktop ça ouvre WhatsApp Web.
 * La page POS reste intacte dans l'onglet d'origine.
 */
export function triggerWhatsAppShare(phone: string | null | undefined, message: string): void {
  const cleanPhone = normalizeWhatsAppPhone(phone);
  const encodedMsg = encodeURIComponent(message);
  const url        = `https://wa.me/${cleanPhone}?text=${encodedMsg}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}
