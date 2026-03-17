/**
 * Order Service — Couche métier
 *
 * Centralise toute la logique de création, validation et calcul des commandes.
 * Utilisé par le renderer via les hooks, et par le main process via IPC.
 */

import type { Cart, CartItem, Coupon, Order, PaymentMethod } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrderTotals {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
}

export interface CreateOrderPayload {
  businessId: string;
  cashierId: string;
  cart: Cart;
  paymentMethod: PaymentMethod;
  paymentAmount: number;  // montant effectivement encaissé (≥ total pour espèces)
  taxRate: number;        // en %, ex: 18
  notes?: string;
}

export type OrderValidationError =
  | { code: 'EMPTY_CART' }
  | { code: 'INSUFFICIENT_PAYMENT'; due: number; received: number }
  | { code: 'NO_BUSINESS' }
  | { code: 'NO_CASHIER' };

// ─── Calculs ─────────────────────────────────────────────────────────────────

export function computeSubtotal(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.price * i.quantity, 0);
}

export function computeDiscount(coupon: Coupon | null | undefined, subtotal: number): number {
  if (!coupon) return 0;
  if (coupon.type === 'percentage') {
    return round2(subtotal * coupon.value / 100);
  }
  return Math.min(coupon.value, subtotal);
}

export function computeTax(taxableAmount: number, taxRate: number): number {
  return round2(taxableAmount * taxRate / 100);
}

export function computeOrderTotals(
  items: CartItem[],
  coupon: Coupon | null | undefined,
  taxRate: number
): OrderTotals {
  const subtotal       = computeSubtotal(items);
  const discountAmount = computeDiscount(coupon, subtotal);
  const taxable        = subtotal - discountAmount;
  const taxAmount      = computeTax(taxable, taxRate);
  const total          = round2(taxable + taxAmount);

  return { subtotal, discountAmount, taxAmount, total };
}

/** Rendu monnaie pour un paiement en espèces */
export function computeChange(amountReceived: number, total: number): number {
  return Math.max(0, round2(amountReceived - total));
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateOrderPayload(
  payload: CreateOrderPayload
): OrderValidationError | null {
  if (!payload.businessId) return { code: 'NO_BUSINESS' };
  if (!payload.cashierId)  return { code: 'NO_CASHIER' };
  if (payload.cart.items.length === 0) return { code: 'EMPTY_CART' };

  const { total } = computeOrderTotals(
    payload.cart.items,
    payload.cart.coupon,
    payload.taxRate
  );

  // Pour espèces, le montant reçu doit couvrir le total
  if (
    payload.paymentMethod === 'cash' &&
    payload.paymentAmount < total - 0.01 // tolérance centimes
  ) {
    return {
      code: 'INSUFFICIENT_PAYMENT',
      due: total,
      received: payload.paymentAmount,
    };
  }

  return null; // valide
}

// ─── Transformation → format Supabase ────────────────────────────────────────

export function buildOrderDbPayload(payload: CreateOrderPayload): Record<string, unknown> {
  const { subtotal, discountAmount, taxAmount, total } = computeOrderTotals(
    payload.cart.items,
    payload.cart.coupon,
    payload.taxRate
  );

  return {
    business_id:     payload.businessId,
    cashier_id:      payload.cashierId,
    items: payload.cart.items.map((item) => ({
      product_id:      item.product_id,
      variant_id:      item.variant_id,
      name:            item.name,
      price:           item.price,
      quantity:        item.quantity,
      discount_amount: 0,
      total:           round2(item.price * item.quantity),
      notes:           item.notes,
    })),
    payment: {
      method:    payload.paymentMethod,
      amount:    payload.paymentAmount,
    },
    subtotal,
    tax_amount:      taxAmount,
    discount_amount: discountAmount,
    total,
    coupon_id:   payload.cart.coupon?.id,
    coupon_code: payload.cart.coupon?.code,
    notes:       payload.notes ?? payload.cart.notes,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatOrderError(error: OrderValidationError): string {
  switch (error.code) {
    case 'EMPTY_CART':
      return 'Le panier est vide';
    case 'NO_BUSINESS':
      return 'Aucun établissement sélectionné';
    case 'NO_CASHIER':
      return 'Utilisateur non identifié';
    case 'INSUFFICIENT_PAYMENT':
      return `Montant insuffisant : reçu ${error.received.toFixed(2)}, dû ${error.due.toFixed(2)}`;
  }
}

/** Regrouper les items identiques (même product + variant) */
export function mergeCartItems(items: CartItem[]): CartItem[] {
  const map = new Map<string, CartItem>();
  for (const item of items) {
    const key = `${item.product_id}::${item.variant_id ?? ''}`;
    const existing = map.get(key);
    if (existing) {
      map.set(key, { ...existing, quantity: existing.quantity + item.quantity });
    } else {
      map.set(key, { ...item });
    }
  }
  return Array.from(map.values());
}
