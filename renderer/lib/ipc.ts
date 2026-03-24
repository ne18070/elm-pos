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

export async function testPrinterConnection(
  ip: string,
  port: number
): Promise<{ connected: boolean; latency?: number; error?: string }> {
  if (!api) return { connected: false, error: 'Non disponible hors Electron' };
  const result = await (api.hardware as any).testPrinterConnection(ip, port) as { success: boolean; data?: { connected: boolean; latency?: number; error?: string } };
  return result.data ?? { connected: false };
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
