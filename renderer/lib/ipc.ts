/**
 * Couche IPC côté renderer
 * Fournit des helpers typés qui tombent en fallback silencieux
 * quand on est en dehors d'Electron (navigateur pur, tests).
 */

const api = typeof window !== 'undefined' && 'electronAPI' in window
  ? window.electronAPI
  : null;

export const isElectron = !!api;

// ─── Imprimante ───────────────────────────────────────────────────────────────

export async function printReceipt(
  data: unknown
): Promise<{ success: boolean; error?: string }> {
  if (!api) {
    console.log('[DEV] Impression simulée :', data);
    return { success: true };
  }
  return api.hardware.printReceipt(data) as Promise<{ success: boolean; error?: string }>;
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
