import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export const CURRENCY_LABEL: Record<string, string> = { XOF: 'FCFA', XAF: 'FCFA' };
export function displayCurrency(code: string): string { return CURRENCY_LABEL[code] ?? code; }
const CURRENCY_DECIMALS: Record<string, number> = { XOF: 0, XAF: 0, JPY: 0 };

export function formatCurrency(amount: number, currency = 'XOF'): string {
  const decimals = CURRENCY_DECIMALS[currency] ?? (['XOF', 'XAF'].includes(currency) ? 0 : 2);
  const label    = CURRENCY_LABEL[currency] ?? currency;
  const number   = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount || 0);
  return `${number}\u00a0${label}`;
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

/**
 * Format a UTC ISO timestamp in the business's timezone so the displayed time
 * always reflects when the action actually happened at the business location,
 * regardless of where the viewer's browser is.
 *
 * @param iso  - UTC ISO string from the DB (e.g. "2026-05-25T13:56:07.079+00:00")
 * @param tz   - IANA timezone string from business.timezone (e.g. "Africa/Dakar")
 */
export function fmtInTz(iso: string | null | undefined, tz = 'Africa/Dakar'): string {
  if (!iso) return '—';
  const safeZone = (() => {
    try { Intl.DateTimeFormat(undefined, { timeZone: tz }); return tz; } catch { return 'UTC'; }
  })();
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { timeZone: safeZone, day: '2-digit', month: 'short', year: 'numeric' })
    + ' · '
    + d.toLocaleTimeString('fr-FR', { timeZone: safeZone, hour: '2-digit', minute: '2-digit' });
}

export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback UUID v4 — contextes où `crypto.randomUUID` est absent
  // (web servi en HTTP nu, anciens WebView). Reste au format UUID pour les
  // colonnes `uuid` (ex. `orders.client_order_id`).
  const rand = () =>
    typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function'
      ? crypto.getRandomValues(new Uint8Array(1))[0]
      : Math.floor(Math.random() * 256);
  const bytes = Array.from({ length: 16 }, rand);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}
