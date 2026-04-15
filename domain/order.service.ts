/**
 * Order Service — Couche métier
 *
 * Centralise toute la logique de création, validation et calcul des commandes.
 * Utilisé par le renderer via les hooks, et par le main process via IPC.
 */

import type { Cart, CartItem, Coupon, PaymentMethod } from '../types';

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
  taxInclusive?: boolean; // true = prix TTC saisis
  notes?: string;
  tableId?: string;
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

export function computeDiscount(coupons: Coupon[] | Coupon | null | undefined, subtotal: number): number {
  const list = Array.isArray(coupons) ? coupons : coupons ? [coupons] : [];
  if (list.length === 0) return 0;
  let total = 0;
  for (const coupon of list) {
    if (coupon.type === 'free_item') continue;
    total += coupon.type === 'percentage'
      ? round2(subtotal * coupon.value / 100)
      : Math.min(coupon.value, subtotal);
  }
  return Math.min(total, subtotal);
}

export function computeTax(taxableAmount: number, taxRate: number): number {
  return round2(taxableAmount * taxRate / 100);
}

export function computeOrderTotals(
  items: CartItem[],
  coupons: Coupon[] | Coupon | null | undefined,
  taxRate: number,
  taxInclusive = false
): OrderTotals {
  const subtotal       = computeSubtotal(items);
  const discountAmount = computeDiscount(coupons, subtotal);
  const taxable        = subtotal - discountAmount;

  let taxAmount: number;
  let total: number;

  if (taxInclusive) {
    // Prix TTC saisis : on extrait la TVA sans changer le total
    total     = taxable;
    taxAmount = taxRate > 0 ? round2(total * taxRate / (100 + taxRate)) : 0;
  } else {
    // Prix HT saisis : on ajoute la TVA au total
    taxAmount = computeTax(taxable, taxRate);
    total     = round2(taxable + taxAmount);
  }

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
    payload.cart.coupons,
    payload.taxRate,
    payload.taxInclusive
  );

  // Pour espèces (paiement complet), le montant reçu doit couvrir le total
  // Paiement partiel (acompte) : autorisé à être inférieur au total
  if (
    payload.paymentMethod === 'cash' &&
    payload.paymentAmount < total - 0.01
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
    payload.cart.coupons,
    payload.taxRate,
    payload.taxInclusive
  );

  const coupons = payload.cart.coupons ?? [];

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
    // backward compat: premier coupon
    coupon_id:   coupons[0]?.id   ?? null,
    coupon_code: coupons[0]?.code ?? null,
    coupon_notes: coupons[0]?.type === 'free_item' ? (coupons[0].free_item_label ?? null) : null,
    // tableau complet
    coupon_ids:  coupons.map((c) => c.id),
    coupon_codes: coupons.map((c) => c.code),
    notes:       payload.notes ?? payload.cart.notes,
    table_id:    payload.tableId ?? null,
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
