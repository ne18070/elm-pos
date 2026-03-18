/**
 * Payment Service — Couche métier paiement
 *
 * Gère la logique de paiement indépendamment du transport (Supabase / offline).
 */

import type { PaymentMethod, Order } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaymentStatus = 'idle' | 'processing' | 'success' | 'error';

export interface PaymentRequest {
  orderId: string;
  method: PaymentMethod;
  amount: number;      // montant total dû
  received?: number;   // montant reçu (espèces uniquement)
  reference?: string;  // ref carte / mobile
}

export interface PaymentResult {
  success: boolean;
  change?: number;
  error?: string;
  transactionId?: string;
}

export type PaymentValidationError =
  | { code: 'ZERO_AMOUNT' }
  | { code: 'NEGATIVE_AMOUNT' }
  | { code: 'CASH_INSUFFICIENT'; change: number }
  | { code: 'CARD_NO_REFERENCE' };

// ─── Validation ───────────────────────────────────────────────────────────────

export function validatePayment(req: PaymentRequest): PaymentValidationError | null {
  if (req.amount <= 0) return { code: 'ZERO_AMOUNT' };
  if (req.amount < 0)  return { code: 'NEGATIVE_AMOUNT' };

  if (req.method === 'cash' && req.received !== undefined) {
    const change = req.received - req.amount;
    if (change < -0.01) {
      return { code: 'CASH_INSUFFICIENT', change };
    }
  }

  return null;
}

// ─── Calculs ──────────────────────────────────────────────────────────────────

export function computeChange(received: number, due: number): number {
  return Math.max(0, Math.round((received - due) * 100) / 100);
}

/** Suggestions de billets/pièces pour le rendu monnaie */
export function suggestRoundAmounts(total: number): number[] {
  const suggestions = new Set<number>();
  // Exact
  suggestions.add(total);
  // Arrondis au-dessus
  const units = [500, 1000, 2000, 5000, 10000, 25000, 50000];
  for (const unit of units) {
    const rounded = Math.ceil(total / unit) * unit;
    if (rounded > total && suggestions.size < 4) {
      suggestions.add(rounded);
    }
    if (suggestions.size >= 4) break;
  }
  return Array.from(suggestions).sort((a, b) => a - b);
}

// ─── Formatage des méthodes ───────────────────────────────────────────────────

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash:         'Espèces',
  card:         'Carte bancaire',
  mobile_money: 'Mobile Money',
  partial:      'Paiement partiel',
};

export const PAYMENT_METHOD_ICONS: Record<PaymentMethod, string> = {
  cash:         'Banknote',
  card:         'CreditCard',
  mobile_money: 'Smartphone',
  partial:      'SplitSquareHorizontal',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function formatPaymentError(error: PaymentValidationError): string {
  switch (error.code) {
    case 'ZERO_AMOUNT':
      return 'Le montant ne peut pas être nul';
    case 'NEGATIVE_AMOUNT':
      return 'Le montant ne peut pas être négatif';
    case 'CASH_INSUFFICIENT':
      return `Montant insuffisant (manque ${Math.abs(error.change).toFixed(2)})`;
    case 'CARD_NO_REFERENCE':
      return 'Référence de transaction requise';
  }
}

/** Vérifier si une commande est entièrement payée */
export function isFullyPaid(order: Order): boolean {
  const paidAmount = order.payments.reduce((sum, p) => sum + p.amount, 0);
  return paidAmount >= order.total - 0.01;
}

// ─── Paiement partiel ─────────────────────────────────────────────────────────

export interface PartialPaymentLine {
  method: Exclude<PaymentMethod, 'partial'>;
  amount: number;     // montant alloué à ce mode
  received?: number;  // espèces seulement — montant physiquement remis
}

export function partialTotal(lines: PartialPaymentLine[]): number {
  return Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
}

export function partialChange(lines: PartialPaymentLine[]): number {
  return Math.round(
    lines
      .filter((l) => l.method === 'cash' && l.received !== undefined)
      .reduce((s, l) => s + (l.received! - l.amount), 0) * 100
  ) / 100;
}

export function validatePartialPayments(
  lines: PartialPaymentLine[],
  total: number
): string | null {
  if (lines.length < 1) return 'Ajoutez au moins un mode de paiement';
  for (const l of lines) {
    if (l.amount <= 0) return 'Chaque montant doit être positif';
    if (l.method === 'cash' && l.received !== undefined && l.received < l.amount - 0.01) {
      return 'Montant espèces insuffisant';
    }
  }
  const sum = partialTotal(lines);
  if (Math.abs(sum - total) > 0.01) {
    return `Total des paiements (${sum.toFixed(0)}) ≠ total dû (${total.toFixed(0)})`;
  }
  return null;
}
