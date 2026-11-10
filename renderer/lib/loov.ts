import { createHmac, timingSafeEqual } from 'crypto';

// Client Loov (paiements mobile money) — import ONLY in server route handlers under app/api/.
// Doc : https://loov-solutions.com/docs — LOOV_API_KEY (loov_test_… / loov_live_…) ne quitte jamais le serveur.

const DEFAULT_BASE_URL = 'https://api.secure.payment.loov-solutions.com';
const WEBHOOK_TOLERANCE_S = 300;

export type LoovStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'expired';

export const LOOV_FINAL_STATUSES: readonly LoovStatus[] = ['succeeded', 'failed', 'expired'];

export interface LoovPayment {
  reference:          string;
  type:               'payin' | 'payout';
  status:             LoovStatus;
  livemode:           boolean;
  currency:           string;
  amount:             number;
  operator:           string | null;
  phone_number:       string | null;
  checkout_url:       string | null;
  merchant_reference: string | null;
  failure:            { code: string; message: string; reason: string | null } | null;
}

export class LoovError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

function config() {
  const apiKey = process.env.LOOV_API_KEY ?? '';
  if (!apiKey) throw new LoovError(500, 'not_configured', 'LOOV_API_KEY manquante');
  const baseUrl = (process.env.LOOV_API_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  return { apiKey, baseUrl };
}

export function isLoovConfigured(): boolean {
  return !!process.env.LOOV_API_KEY;
}

export function isLoovTestMode(): boolean {
  return (process.env.LOOV_API_KEY ?? '').startsWith('loov_test_');
}

async function loovFetch<T>(path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
  const { apiKey, baseUrl } = config();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    Accept:        'application/json',
  };
  if (init.body) headers['Content-Type'] = 'application/json';
  if (init.idempotencyKey) headers['Idempotency-Key'] = init.idempotencyKey;

  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
    cache:  'no-store',
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = body?.error;
    throw new LoovError(res.status, err?.code ?? 'http_error', err?.message ?? `Loov HTTP ${res.status}`, err?.details);
  }
  return body as T;
}

export function createMobileMoneyPayment(input: {
  amount:            number;
  currency:          string;
  operator:          string;
  phoneNumber:       string;
  /** Code de validation, pour les opérateurs qui en exigent un (422 otp_required). */
  otp?:              string;
  customer:          { name: string; email: string };
  merchantReference: string;
  description?:      string;
  callbackUrl?:      string;
  metadata?:         Record<string, string>;
}): Promise<LoovPayment> {
  return loovFetch<LoovPayment>('/v2/payments', {
    method:         'POST',
    // Rejouer la même tentative (double clic, timeout) ne débite pas deux fois
    idempotencyKey: input.merchantReference,
    body: JSON.stringify({
      amount:             input.amount,
      currency:           input.currency,
      operator:           input.operator,
      phone_number:       input.phoneNumber,
      otp:                input.otp,
      // Fournisseur imposé (paydunya, pal…) ; absent = celui par défaut de l'opérateur chez Loov
      provider:           process.env.LOOV_PAYIN_PROVIDER || undefined,
      customer:           input.customer,
      merchant_reference: input.merchantReference,
      description:        input.description,
      callback_url:       input.callbackUrl,
      metadata:           input.metadata,
    }),
  });
}

/** Interroger un paiement en cours fait aussi interroger l'opérateur par Loov. */
export function getPayment(reference: string): Promise<LoovPayment> {
  return loovFetch<LoovPayment>(`/v2/payments/${encodeURIComponent(reference)}`);
}

/** Retrouve une tentative dont la réponse de création s'est perdue (timeout) — merchant_reference est unique. */
export async function findPaymentByMerchantReference(merchantReference: string): Promise<LoovPayment | null> {
  const res = await loovFetch<{ data: LoovPayment[] }>(
    `/v2/transactions?type=payin&merchant_reference=${encodeURIComponent(merchantReference)}&limit=1`,
  );
  return res.data?.[0] ?? null;
}

/** Clés de test uniquement. */
export function simulatePayment(reference: string, outcome: 'succeeded' | 'failed'): Promise<LoovPayment> {
  return loovFetch<LoovPayment>(`/v2/test/transactions/${encodeURIComponent(reference)}/simulate`, {
    method: 'POST',
    body:   JSON.stringify({ outcome }),
  });
}

/**
 * Vérifie l'en-tête `Loov-Signature: t=<unix>,v1=<hex>` :
 * HMAC-SHA256("{t}.{corps brut}", LOOV_WEBHOOK_SECRET), horodatage de moins de 5 min.
 */
export function verifyWebhookSignature(rawBody: string, header: string | null, now = Date.now()): boolean {
  const secret = process.env.LOOV_WEBHOOK_SECRET ?? '';
  if (!secret || !header) return false;

  const match = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header.trim());
  if (!match) return false;
  const [, t, signature] = match;
  if (Math.abs(now / 1000 - Number(t)) > WEBHOOK_TOLERANCE_S) return false;

  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest();
  const received = Buffer.from(signature, 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}
