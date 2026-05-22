import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

export const VALID_SCOPES = [
  'read:products',  'write:products',
  'read:orders',    'write:orders',
  'read:clients',   'write:clients',
  'read:students',  'write:students',
  'read:resellers',   'write:resellers',
  'read:services',    'write:services',
  'read:hotel',       'write:hotel',
  'read:restaurant',  'write:restaurant',
  'read:analytics',
] as const;

export type Scope = typeof VALID_SCOPES[number];

// ─── SHA-256 via SubtleCrypto ─────────────────────────────────────────────────

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ─── Key generation ───────────────────────────────────────────────────────────

export async function generateApiKey(): Promise<{ raw: string; prefix: string; hash: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  const raw = `elm_live_${hex}`;
  const prefix = raw.slice(0, 17); // "elm_live_" + 8 hex chars
  const hash = await sha256(raw);
  return { raw, prefix, hash };
}

// ─── Admin Supabase client ────────────────────────────────────────────────────

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase admin credentials not configured.');
  return createClient(url, key);
}

// ─── In-memory rate limiter: 120 requests/minute per key hash ────────────────

type RateBucket = { count: number; windowStart: number };
const rateBuckets = new Map<string, RateBucket>();
const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(keyHash: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(keyHash);
  if (!bucket || now - bucket.windowStart >= RATE_WINDOW_MS) {
    rateBuckets.set(keyHash, { count: 1, windowStart: now });
    return true;
  }
  if (bucket.count >= RATE_LIMIT) return false;
  bucket.count++;
  return true;
}

// ─── Subscription check ───────────────────────────────────────────────────────

async function assertActiveSubscription(admin: ReturnType<typeof getAdmin>, businessId: string): Promise<void> {
  const { data: sub } = await admin
    .from('subscriptions')
    .select('status, trial_ends_at, expires_at')
    .eq('business_id', businessId)
    .maybeSingle();

  if (!sub) {
    throw Object.assign(new Error('No active subscription found for this business.'), { status: 402 });
  }

  const now = new Date();

  if (sub.status === 'trial') {
    const trialEnd = sub.trial_ends_at ? new Date(sub.trial_ends_at) : null;
    if (trialEnd && now > trialEnd) {
      throw Object.assign(new Error('Trial period has expired. Please subscribe to continue using the API.'), { status: 402 });
    }
    return; // trial still valid
  }

  if (sub.status === 'active') {
    const expiresAt = sub.expires_at ? new Date(sub.expires_at) : null;
    if (expiresAt && now > expiresAt) {
      throw Object.assign(new Error('Subscription has expired. Please renew to continue using the API.'), { status: 402 });
    }
    return; // active and not expired
  }

  // status === 'expired' or anything else
  throw Object.assign(new Error('Subscription is expired. Please renew to continue using the API.'), { status: 402 });
}

// ─── Validation ───────────────────────────────────────────────────────────────

export interface ValidatedKey {
  businessId: string;
  scopes: string[];
  keyHash: string;
}

export async function validateApiKey(rawKey: string, requiredScope?: string): Promise<ValidatedKey> {
  if (!rawKey?.startsWith('elm_live_')) {
    throw Object.assign(new Error('Invalid API key format.'), { status: 401 });
  }

  const admin = getAdmin();
  const keyHash = await sha256(rawKey);

  if (!checkRateLimit(keyHash)) {
    throw Object.assign(new Error('Rate limit exceeded. Try again in a minute.'), { status: 429 });
  }

  const { data: keyRow, error } = await admin
    .from('api_keys')
    .select('business_id, scopes, is_active')
    .eq('key_hash', keyHash)
    .maybeSingle();

  if (error || !keyRow) {
    throw Object.assign(new Error('Invalid API key.'), { status: 401 });
  }
  if (!keyRow.is_active) {
    throw Object.assign(new Error('API key has been revoked.'), { status: 401 });
  }

  // Check that the business has a valid subscription
  await assertActiveSubscription(admin, keyRow.business_id);

  if (requiredScope && !keyRow.scopes.includes(requiredScope)) {
    throw Object.assign(
      new Error(`Missing required scope: ${requiredScope}.`),
      { status: 403 },
    );
  }

  // Fire-and-forget: update last_used_at
  void Promise.resolve(
    admin
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('key_hash', keyHash),
  ).catch(() => {/* ignore */});

  return { businessId: keyRow.business_id, scopes: keyRow.scopes, keyHash };
}

// ─── Helpers for route handlers ───────────────────────────────────────────────

export function getApiKey(request: Request): string {
  const key = request.headers.get('x-api-key') ?? '';
  if (!key) throw Object.assign(new Error('Missing X-API-Key header.'), { status: 401 });
  return key;
}

export function apiError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export function apiOk(data: unknown, meta?: { total?: number; page?: number; limit?: number }): Response {
  return Response.json({ data, ...meta });
}

export function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  };
}

export function handleAuthError(err: unknown): Response {
  const e = err as { status?: number; message?: string };
  const status = e.status ?? 500;
  const message = e.message ?? 'Internal server error.';
  return Response.json({ error: message }, { status, headers: corsHeaders() });
}
