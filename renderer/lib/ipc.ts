/**
 * Couche IPC côté renderer
 * - En mode Electron : délègue à window.electronAPI (IPC natif)
 * - En mode Web     : utilise des fallbacks navigateur (BroadcastChannel, window.print…)
 */

import type { ReceiptData } from '../../types';

const api = typeof window !== 'undefined' && 'electronAPI' in window
  ? window.electronAPI
  : null;

export const isElectron = !!api;

// ─── Imprimante ───────────────────────────────────────────────────────────────

export interface PrinterConfig {
  type: 'usb' | 'network';
  ip: string;
  port: number;
}

const PRINTER_CONFIG_KEY = 'printer_config';

export function loadPrinterConfig(): PrinterConfig {
  if (typeof window === 'undefined') return { type: 'usb', ip: '', port: 9100 };
  try {
    const raw = localStorage.getItem(PRINTER_CONFIG_KEY);
    return raw ? JSON.parse(raw) : { type: 'usb', ip: '', port: 9100 };
  } catch {
    return { type: 'usb', ip: '', port: 9100 };
  }
}

export function savePrinterConfig(config: PrinterConfig): void {
  localStorage.setItem(PRINTER_CONFIG_KEY, JSON.stringify(config));
}

export async function printReceipt(
  data: unknown
): Promise<{ success: boolean; error?: string }> {
  if (!api) {
    // Mode web : impression via la fenêtre navigateur
    const { printReceiptBrowser } = await import('./print-web');
    return printReceiptBrowser(data as ReceiptData);
  }
  const printerConfig = loadPrinterConfig();
  return api.hardware.printReceipt({ ...(data as object), printerConfig }) as Promise<{ success: boolean; error?: string }>;
}

async function testPrinterConnectionWeb(
  ip: string,
): Promise<{ connected: boolean; latency?: number; error?: string }> {
  // En mode web, les sockets TCP bruts ne sont pas accessibles.
  // On tente un fetch HTTP vers l'interface web de l'imprimante (port 80).
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    await fetch(`http://${ip}/`, { method: 'HEAD', signal: ctrl.signal, mode: 'no-cors' });
    clearTimeout(timer);
    return { connected: true, latency: Date.now() - t0 };
  } catch (e: unknown) {
    const msg = e instanceof Error && e.name === 'AbortError' ? 'Aucune réponse après 3 secondes' : 'Adresse introuvable sur le réseau';
    return { connected: false, error: msg };
  }
}

export async function testPrinterConnection(
  ip: string,
  port: number
): Promise<{ connected: boolean; latency?: number; error?: string }> {
  if (!api) return testPrinterConnectionWeb(ip);
  const result = await (api.hardware as any).testPrinterConnection(ip, port) as { success: boolean; data?: { connected: boolean; latency?: number; error?: string } };
  return result.data ?? { connected: false };
}

// ─── Tiroir-caisse ────────────────────────────────────────────────────────────

export interface CashDrawerConfig {
  enabled: boolean;
}

const CASH_DRAWER_CONFIG_KEY = 'cash_drawer_config';

export function loadCashDrawerConfig(): CashDrawerConfig {
  if (typeof window === 'undefined') return { enabled: false };
  try {
    const raw = localStorage.getItem(CASH_DRAWER_CONFIG_KEY);
    return raw ? JSON.parse(raw) : { enabled: false };
  } catch {
    return { enabled: false };
  }
}

export function saveCashDrawerConfig(config: CashDrawerConfig): void {
  localStorage.setItem(CASH_DRAWER_CONFIG_KEY, JSON.stringify(config));
}

/**
 * Ouvre le tiroir-caisse. Utilise la même config imprimante pour la connexion.
 * Silencieux si le tiroir n'est pas activé ou si hors Electron.
 */
export async function openCashDrawer(): Promise<{ success: boolean; error?: string }> {
  const { enabled } = loadCashDrawerConfig();
  if (!enabled || !api) return { success: false };
  const printerConfig = loadPrinterConfig();
  const result = await (api.hardware as any).openCashDrawer(printerConfig) as { success: boolean; error?: string };
  return result;
}

// ─── Sync queue ───────────────────────────────────────────────────────────────

export async function enqueueToSync(operation: string, payload: unknown): Promise<void> {
  if (!api) return;
  await api.sync.addToQueue(operation, payload);
}

export async function flushSyncQueue(): Promise<void> {
  if (!api) return;
  await api.sync.flush();
}

export async function retryFailedSync(): Promise<void> {
  if (!api) return;
  await api.sync.retryFailed();
}

export interface SyncStats {
  pending: number;
  failed:  number;
  synced:  number;
  syncing: boolean;
}

export async function getSyncStatus(): Promise<SyncStats> {
  if (!api) return { pending: 0, failed: 0, synced: 0, syncing: false };
  const result = await api.sync.getStatus() as { data?: SyncStats };
  return result.data ?? { pending: 0, failed: 0, synced: 0, syncing: false };
}

// ─── Événements ───────────────────────────────────────────────────────────────

export function onBarcodeScan(callback: (barcode: string) => void): () => void {
  if (!api) return () => {};
  return api.hardware.onBarcodeScan(callback);
}

export function onNfcRead(
  callback: (data: Record<string, unknown>) => void
): () => void {
  if (!api) return () => {};
  return api.hardware.onNfcRead(callback);
}

export function onSyncStarted(callback: () => void): () => void {
  if (!api) return () => {};
  return api.sync.onStarted(callback);
}

export function onSyncComplete(
  callback: (result: { processed: number; failed: number; stats: SyncStats }) => void
): () => void {
  if (!api) return () => {};
  return api.sync.onComplete(callback as (r: unknown) => void);
}

export function onNetworkOnline(callback: () => void): () => void {
  if (!api) return () => {};
  return api.sync.onOnline(callback);
}
