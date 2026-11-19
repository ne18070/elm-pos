/**
 * URL d'une image QR (PNG, api.qrserver.com) — seul constructeur de ces URL :
 * QR des paramètres, affiches imprimées…
 */
export interface QrImageOptions {
  /** Côté en pixels (défaut 512) */
  size?: number;
  /** Marge blanche en pixels (défaut 16) */
  margin?: number;
  /** Correction d'erreur (défaut H) */
  ecc?: 'L' | 'M' | 'Q' | 'H';
}

export function qrImageUrl(data: string, { size = 512, margin = 16, ecc = 'H' }: QrImageOptions = {}) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=${margin}&ecc=${ecc}&format=png&data=${encodeURIComponent(data)}`;
}
