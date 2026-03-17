import type { IpcMain, BrowserWindow } from 'electron';
import { net } from 'electron';
import type { IpcResponse } from '../../types';
import {
  enqueueSync,
  getPendingSyncItems,
  markSynced,
  markFailed,
  getSyncStats,
  type SyncRow,
} from '../store/local-db';

// ─── État interne ─────────────────────────────────────────────────────────────

let syncInProgress = false;
let mainWindow: BrowserWindow | null = null;
let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

const FALLBACK_INTERVAL_MS = 60_000; // 1 min si event-driven ne déclenche pas

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

export function registerSyncHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('sync:status', (): IpcResponse => {
    try {
      const stats = getSyncStats();
      return {
        success: true,
        data: { ...stats, syncing: syncInProgress },
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(
    'sync:queue:add',
    (_event, { operation, payload }: { operation: string; payload: unknown }): IpcResponse => {
      try {
        const id = enqueueSync(operation, payload);
        // Tenter une sync immédiate si on est en ligne
        triggerSync();
        return { success: true, data: { id } };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }
  );

  ipcMain.handle('sync:queue:flush', async (): Promise<IpcResponse> => {
    try {
      const result = await runSync();
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('sync:retry-failed', async (): Promise<IpcResponse> => {
    try {
      // Remettre les items "failed" en "pending" pour re-tentative manuelle
      const { getLocalDb } = await import('../store/local-db');
      getLocalDb()
        .prepare(`UPDATE sync_queue SET status = 'pending', next_retry = NULL WHERE status = 'failed'`)
        .run();
      const result = await runSync();
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
}

// ─── Démarrage ────────────────────────────────────────────────────────────────

export function startSyncEngine(win: BrowserWindow): void {
  mainWindow = win;

  // Écouter les événements réseau d'Electron (event-driven)
  net.fetch('https://dns.google/resolve?name=supabase.com', { method: 'HEAD' })
    .then(() => triggerSync())
    .catch(() => {/* hors ligne au démarrage, OK */});

  // Fallback : vérification périodique si l'event réseau ne se déclenche pas
  scheduleFallback();
}

/** Déclenché quand la connexion réseau revient (via Electron net) */
export function onNetworkOnline(): void {
  notify('sync:online', {});
  triggerSync();
}

// ─── Sync core ────────────────────────────────────────────────────────────────

/** Lance une sync si pas déjà en cours, sans bloquer */
export function triggerSync(): void {
  if (syncInProgress) return;
  if (!isOnline()) return;
  runSync().catch(console.error);
}

async function runSync(): Promise<{ processed: number; failed: number }> {
  if (syncInProgress) return { processed: 0, failed: 0 };
  syncInProgress = true;
  notify('sync:started', {});

  let processed = 0;
  let failed = 0;

  const items = getPendingSyncItems();

  for (const item of items) {
    try {
      await processItem(item);
      markSynced(item.id);
      processed++;
    } catch (error) {
      const newAttempts = item.attempts + 1;
      markFailed(item.id, String(error), newAttempts);
      failed++;
    }
  }

  syncInProgress = false;

  const stats = getSyncStats();
  notify('sync:complete', { processed, failed, stats });

  // Si des items sont encore en pending (next_retry dans le futur), planifier
  if (stats.pending > 0) {
    scheduleFallback(10_000); // re-tenter dans 10s
  }

  return { processed, failed };
}

async function processItem(item: SyncRow): Promise<void> {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const payload = JSON.parse(item.payload) as Record<string, unknown>;

  switch (item.operation) {
    case 'create_order': {
      const { error } = await supabase.rpc('create_order', { order_data: payload });
      if (error) throw new Error(error.message);
      break;
    }
    case 'update_order': {
      const { id, ...data } = payload;
      const { error } = await supabase
        .from('orders')
        .update(data)
        .eq('id', id as string);
      if (error) throw new Error(error.message);
      break;
    }
    case 'create_payment': {
      const { error } = await supabase.from('payments').insert(payload);
      if (error) throw new Error(error.message);
      break;
    }
    default:
      throw new Error(`Opération inconnue : ${item.operation}`);
  }
}

// ─── Utilitaires ──────────────────────────────────────────────────────────────

function isOnline(): boolean {
  return net.isOnline();
}

function notify(channel: string, data: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function scheduleFallback(ms = FALLBACK_INTERVAL_MS): void {
  if (fallbackTimer) clearTimeout(fallbackTimer);
  fallbackTimer = setTimeout(() => {
    fallbackTimer = null;
    triggerSync();
    scheduleFallback(); // re-planifier
  }, ms);
}
