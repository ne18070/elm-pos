/**
 * Coupon Service — Couche métier codes promo
 *
 * Valide et applique les coupons côté client avant l'appel Supabase.
 * Évite un aller-retour réseau pour des erreurs détectables localement.
 */

import type { Coupon } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CouponValidationError =
  | { code: 'NOT_FOUND' }
  | { code: 'INACTIVE' }
  | { code: 'EXPIRED'; expiredAt: string }
  | { code: 'MAX_USES_REACHED'; maxUses: number; current: number }
  | { code: 'MIN_ORDER_NOT_MET'; minimum: number; current: number }
  | { code: 'USER_LIMIT_REACHED'; limit: number };

export interface CouponApplyResult {
  valid: true;
  discountAmount: number;
  coupon: Coupon;
}

export interface CouponApplyError {
  valid: false;
  error: CouponValidationError;
}

// ─── Validation locale (avant appel Supabase) ─────────────────────────────────

export function validateCouponLocal(
  coupon: Coupon,
  orderSubtotal: number
): CouponValidationError | null {
  if (!coupon.is_active) {
    return { code: 'INACTIVE' };
  }

  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return { code: 'EXPIRED', expiredAt: coupon.expires_at };
  }

  if (coupon.max_uses && coupon.uses_count >= coupon.max_uses) {
    return {
      code: 'MAX_USES_REACHED',
      maxUses: coupon.max_uses,
      current: coupon.uses_count,
    };
  }

  if (coupon.min_order_amount && orderSubtotal < coupon.min_order_amount) {
    return {
      code: 'MIN_ORDER_NOT_MET',
      minimum: coupon.min_order_amount,
      current: orderSubtotal,
    };
  }

  return null; // valide
}

// ─── Calcul de la remise ──────────────────────────────────────────────────────

export function applyCoupon(
  coupon: Coupon,
  subtotal: number
): CouponApplyResult | CouponApplyError {
  const error = validateCouponLocal(coupon, subtotal);
  if (error) return { valid: false, error };

  let discountAmount: number;
  if (coupon.type === 'percentage') {
    discountAmount = Math.round(subtotal * coupon.value / 100 * 100) / 100;
  } else {
    discountAmount = Math.min(coupon.value, subtotal);
  }

  return { valid: true, discountAmount, coupon };
}

// ─── Formatage des erreurs ────────────────────────────────────────────────────

export function formatCouponError(error: CouponValidationError): string {
  switch (error.code) {
    case 'NOT_FOUND':
      return 'Coupon introuvable';
    case 'INACTIVE':
      return 'Ce coupon est désactivé';
    case 'EXPIRED':
      return `Ce coupon a expiré le ${new Date(error.expiredAt).toLocaleDateString('fr-FR')}`;
    case 'MAX_USES_REACHED':
      return `Ce coupon a atteint sa limite (${error.maxUses} utilisations)`;
    case 'MIN_ORDER_NOT_MET':
      return `Montant minimum requis : ${error.minimum.toFixed(2)} (panier : ${error.current.toFixed(2)})`;
    case 'USER_LIMIT_REACHED':
      return `Vous avez déjà utilisé ce coupon ${error.limit} fois`;
  }
}

// ─── Affichage ────────────────────────────────────────────────────────────────

export function describeCoupon(coupon: Coupon): string {
  if (coupon.type === 'percentage') {
    return `-${coupon.value}%`;
  }
  return `-${coupon.value}`;
}
