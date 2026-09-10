import type { Coupon } from '@pos-types';
import { calculateDiscount } from '@services/pricing';
import type { QuickLine } from '@/store/quickOrder';

/**
 * Totaux de l'écran « Commande rapide », alignés sur la facture distributeur :
 * les P.U saisis sont TTC (TVA 18 % incluse), on en extrait HT + TVA.
 *
 * Remise = coupons uniquement (même règle que le POS) : `calculateDiscount`.
 */
export interface QuickTotals {
  itemCount: number;
  /** Σ P.U × Qté des lignes payantes (TTC, avant remise). */
  subtotal: number;
  couponDiscount: number;
  /** Net à payer (TTC). */
  net: number;
  totalHT: number;
  tva: number;
}

const VAT_RATE = 0.18;

export function computeQuickTotals(lines: QuickLine[], coupons: Coupon[]): QuickTotals {
  const paid = lines.filter((l) => !l.is_gift);
  const subtotal = paid.reduce((s, l) => s + l.unit_price * l.qty, 0);
  const itemCount = paid.reduce((n, l) => n + l.qty, 0);

  const couponDiscount = coupons.length > 0 ? calculateDiscount(coupons, subtotal, itemCount) : 0;
  const net = Math.max(0, subtotal - couponDiscount);
  const totalHT = net / (1 + VAT_RATE);

  return { itemCount, subtotal, couponDiscount, net, totalHT, tva: net - totalHT };
}
