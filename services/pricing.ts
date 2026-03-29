import type { Coupon } from '../types';

/**
 * Calcule le montant de remise à partir d'une liste de coupons et d'un sous-total.
 * Les coupons de type `free_item` sont ignorés (gérés séparément via addFreeItem).
 */
export function calculateDiscount(coupons: Coupon[], subtotal: number): number {
  if (coupons.length === 0) return 0;
  let total = 0;
  for (const coupon of coupons) {
    if (coupon.type === 'free_item') continue;
    total += coupon.type === 'percentage'
      ? Math.round(subtotal * coupon.value / 100 * 100) / 100
      : Math.min(coupon.value, subtotal);
  }
  return Math.min(total, subtotal);
}
