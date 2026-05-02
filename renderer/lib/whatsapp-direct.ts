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
 * Triggers a direct WhatsApp share via wa.me.
 * On mobile, uses window.location.href to bypass popup blockers.
 * On desktop, uses window.open to keep the current app state.
 */
export function triggerWhatsAppShare(phone: string | null | undefined, message: string): void {
  const cleanPhone = normalizeWhatsAppPhone(phone);
  const encodedMessage = encodeURIComponent(message);
  const waUrl = `https://wa.me/${cleanPhone}?text=${encodedMessage}`;

  if (isMobileDevice()) {
    window.location.href = waUrl;
  } else {
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  }
}
