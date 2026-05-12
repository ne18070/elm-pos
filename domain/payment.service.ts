/**
 * Payment Service — Couche métier paiement
 *
 * Gère la logique de paiement indépendamment du transport (Supabase / offline).
 */

import type { PaymentMethod, Order } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaymentStatus = 'idle' | 'processing' | 'success' | 'error';

/** Opérateurs Mobile Money — permet de différencier frais et processus de vérification */
export type MobileMoneyProvider = 'wave' | 'orange_money' | 'free_money';

export interface PaymentRequest {
  orderId: string;
  method: PaymentMethod;
  amount: number;      // montant total dû
  received?: number;   // montant reçu (espèces uniquement)
  reference?: string;  // ref carte / mobile money — obligatoire pour card et mobile_money
  phone?: string;      // numéro pour mobile money
  provider?: MobileMoneyProvider;  // opérateur mobile money
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
  | { code: 'CASH_INSUFFICIENT'; shortage: number }
  | { code: 'CARD_NO_REFERENCE' }
  | { code: 'MOBILE_MONEY_NO_PHONE' }
  | { code: 'MOBILE_MONEY_NO_REFERENCE' }
  | { code: 'SPLIT_COUNT_INVALID' }
  | { code: 'SPLIT_AMOUNT_MISMATCH'; got: number; expected: number };

// ─── Validation ───────────────────────────────────────────────────────────────

export function validatePayment(req: PaymentRequest): PaymentValidationError | null {
  if (req.amount < 0)   return { code: 'NEGATIVE_AMOUNT' };
  if (req.amount === 0) return { code: 'ZERO_AMOUNT' };

  if (req.method === 'cash' && req.received !== undefined) {
    const shortage = req.amount - req.received;
    if (shortage > 0.01) return { code: 'CASH_INSUFFICIENT', shortage };
  }

  // Si la référence est fournie elle ne peut pas être vide (cohérence)
  // Mais elle reste optionnelle quand aucune intégration terminal/opérateur n'est active
  if (req.method === 'card' && req.reference !== undefined && !req.reference.trim()) {
    return { code: 'CARD_NO_REFERENCE' };
  }

  if (req.method === 'mobile_money') {
    if (req.phone     !== undefined && !req.phone.trim())     return { code: 'MOBILE_MONEY_NO_PHONE' };
    if (req.reference !== undefined && !req.reference.trim()) return { code: 'MOBILE_MONEY_NO_REFERENCE' };
  }

  return null;
}

export function formatPaymentError(error: PaymentValidationError): string {
  switch (error.code) {
    case 'NEGATIVE_AMOUNT':
      return 'Le montant ne peut pas être négatif';
    case 'ZERO_AMOUNT':
      return 'Le montant ne peut pas être nul';
    case 'CASH_INSUFFICIENT':
      return `Montant insuffisant — manque ${formatAmount(error.shortage)}`;
    case 'CARD_NO_REFERENCE':
      return 'Référence de transaction carte requise';
    case 'MOBILE_MONEY_NO_PHONE':
      return 'Numéro de téléphone requis pour Mobile Money';
    case 'MOBILE_MONEY_NO_REFERENCE':
      return 'Référence de transaction Mobile Money requise';
    case 'SPLIT_COUNT_INVALID':
      return 'Le nombre de personnes doit être entre 2 et 10';
    case 'SPLIT_AMOUNT_MISMATCH':
      return `Total des parts (${formatAmount(error.got)}) ≠ total dû (${formatAmount(error.expected)})`;
  }
}

// ─── Calculs ──────────────────────────────────────────────────────────────────

export function computeChange(received: number, due: number): number {
  return Math.max(0, Math.round((received - due) * 100) / 100);
}

/** Arrondit un montant XOF à l'entier le plus proche (CFA = pas de centimes) */
export function roundXOF(amount: number): number {
  return Math.round(amount);
}

/** Formatte un montant sans décimales inutiles (XOF = entier, EUR = 2 décimales) */
function formatAmount(amount: number): string {
  if (Number.isInteger(amount)) return amount.toLocaleString('fr-FR');
  return amount.toFixed(2).replace('.', ',');
}

/** Suggestions de billets/pièces pour le rendu monnaie */
export function suggestRoundAmounts(total: number, currency = 'XOF'): number[] {
  if (total <= 0) return [];

  const suggestions = new Set<number>();
  suggestions.add(Math.round(total)); // exact arrondi

  const units = currency === 'XOF'
    ? [500, 1000, 2000, 5000, 10000, 25000, 50000]
    : [1, 2, 5, 10, 20, 50, 100, 200, 500];

  for (const unit of units) {
    const rounded = Math.ceil(total / unit) * unit;
    if (rounded > total) suggestions.add(rounded);
    if (suggestions.size >= 4) break;
  }
  return Array.from(suggestions).sort((a, b) => a - b).slice(0, 4);
}

// ─── Formatage des méthodes ───────────────────────────────────────────────────

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash:         'Espèces',
  card:         'Carte bancaire',
  mobile_money: 'Mobile Money',
  partial:      'Acompte / Partiel',
  room_charge:  'Note de chambre',
  free:         'Gratuité / Offert',
};

export const PAYMENT_METHOD_ICONS: Record<PaymentMethod, string> = {
  cash:         'Banknote',
  card:         'CreditCard',
  mobile_money: 'Smartphone',
  partial:      'SplitSquareHorizontal',
  room_charge:  'BedDouble',
  free:         'Gift',
};

export const MOBILE_MONEY_PROVIDER_LABELS: Record<MobileMoneyProvider, string> = {
  wave:         'Wave',
  orange_money: 'Orange Money',
  free_money:   'Free Money',
};

// ─── État d'une commande ──────────────────────────────────────────────────────

/** Vérifier si une commande est entièrement payée */
export function isFullyPaid(order: Order): boolean {
  const payments = order.payments ?? [];
  if (payments.length === 0) return false;
  const paidAmount = payments.reduce((sum, p) => sum + (p.amount ?? 0), 0);
  return paidAmount >= order.total - 0.01;
}

/** Montant restant dû sur une commande (0 si entièrement payée) */
export function remainingDue(order: Order): number {
  const payments = order.payments ?? [];
  const paid = payments.reduce((sum, p) => sum + (p.amount ?? 0), 0);
  return Math.max(0, Math.round((order.total - paid) * 100) / 100);
}

// ─── Paiement partiel ─────────────────────────────────────────────────────────

export interface PartialPaymentLine {
  method: Exclude<PaymentMethod, 'partial'>;
  amount: number;     // montant alloué à ce mode
  received?: number;  // espèces seulement — montant physiquement remis
  reference?: string; // ref carte / mobile money
  phone?: string;     // mobile money
  provider?: MobileMoneyProvider;
}

export function partialTotal(lines: PartialPaymentLine[]): number {
  return Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
}

export function partialChange(lines: PartialPaymentLine[]): number {
  return Math.max(
    0,
    Math.round(
      lines
        .filter(l => l.method === 'cash' && l.received !== undefined)
        .reduce((s, l) => s + (l.received! - l.amount), 0) * 100
    ) / 100
  );
}

export function validatePartialPayments(
  lines: PartialPaymentLine[],
  total: number
): string | null {
  if (lines.length < 1) return 'Ajoutez au moins un mode de paiement';

  for (const l of lines) {
    if ((l.method as string) === 'partial') return 'Mode "partiel" non autorisé dans une ligne de paiement';
    if (l.amount < 0)  return 'Un montant ne peut pas être négatif';
    if (l.amount === 0) return 'Chaque montant doit être positif';
    if (l.method === 'cash' && l.received !== undefined && l.received < l.amount - 0.01) {
      return `Montant espèces insuffisant (reçu ${formatAmount(l.received)}, attendu ${formatAmount(l.amount)})`;
    }
    if (l.method === 'card' && !l.reference?.trim()) {
      return 'Référence de transaction carte requise';
    }
    if (l.method === 'mobile_money') {
      if (!l.phone?.trim())     return 'Numéro de téléphone requis pour Mobile Money';
      if (!l.reference?.trim()) return 'Référence de transaction Mobile Money requise';
    }
  }

  const sum = partialTotal(lines);
  if (Math.abs(sum - total) > 0.01) {
    return `Total des paiements (${formatAmount(sum)}) ≠ total dû (${formatAmount(total)})`;
  }
  return null;
}

// ─── Addition partagée ────────────────────────────────────────────────────────

/**
 * Calcule N parts qui somment exactement au total.
 * La dernière part absorbe les écarts d'arrondi.
 */
export function computeSplitShares(total: number, n: number): number[] {
  if (n < 2) return [total];
  const base = Math.round((total / n) * 100) / 100;
  const shares = Array(n - 1).fill(base);
  const last = Math.round((total - base * (n - 1)) * 100) / 100;
  return [...shares, last];
}

export function validateSplitConfig(
  n: number,
  total: number
): PaymentValidationError | null {
  if (!Number.isInteger(n) || n < 2 || n > 10) return { code: 'SPLIT_COUNT_INVALID' };
  if (total <= 0) return { code: 'ZERO_AMOUNT' };
  return null;
}

export function validateSplitPayments(
  payments: { method: PaymentMethod; amount: number }[],
  total: number
): PaymentValidationError | null {
  const got = Math.round(payments.reduce((s, p) => s + p.amount, 0) * 100) / 100;
  if (Math.abs(got - total) > 0.01) return { code: 'SPLIT_AMOUNT_MISMATCH', got, expected: total };
  return null;
}
