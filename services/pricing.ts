import type { Coupon } from '../types';

/**
 * Un coupon est-il encore éligible pour le panier courant ?
 * Recontrôlé à CHAQUE calcul : un panier qui rétrécit sous le minimum requis
 * (montant ou quantité) ne doit plus bénéficier de la remise.
 */
export function isCouponEligible(
  coupon: Coupon,
  subtotal: number,
  cartItemCount: number,
): boolean {
  if (!coupon.is_active) return false;
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) return false;
  if (coupon.max_uses != null && coupon.uses_count >= coupon.max_uses) return false;
  if (coupon.min_order_amount != null && subtotal < coupon.min_order_amount) return false;
  if (coupon.min_quantity != null && cartItemCount < coupon.min_quantity) return false;
  return true;
}

/**
 * Calcule le montant de remise à partir d'une liste de coupons et d'un sous-total.
 * Les coupons de type `free_item` sont ignorés (gérés séparément via addFreeItem).
 * Les coupons devenus inéligibles (minimum non atteint, expiré…) sont ignorés.
 */
export function calculateDiscount(
  coupons: Coupon[],
  subtotal: number,
  cartItemCount = Number.POSITIVE_INFINITY,
): number {
  if (coupons.length === 0) return 0;
  let total = 0;
  for (const coupon of coupons) {
    if (coupon.type === 'free_item') continue;
    if (!isCouponEligible(coupon, subtotal, cartItemCount)) continue;
    total += coupon.type === 'percentage'
      ? Math.round(subtotal * coupon.value / 100 * 100) / 100
      : Math.min(coupon.value, subtotal);
  }
  return Math.min(total, subtotal);
}
