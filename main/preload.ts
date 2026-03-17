import { contextBridge, ipcRenderer } from 'electron';

// ─── Canaux IPC autorisés (whitelist stricte) ────────────────────────────────
// Seuls ces canaux peuvent être invoqués depuis le renderer.
// Toute tentative sur un canal non listé sera bloquée.

const ALLOWED_INVOKE_CHANNELS = new Set([
  'hardware:printer:status',
  'hardware:printer:print',
  'hardware:scanner:status',
  'hardware:nfc:status',
  'sync:status',
  'sync:queue:add',
  'sync:queue:flush',
  'sync:retry-failed',
  'orders:create-local',
  'orders:get-pending',
  'orders:mark-synced',
]);

const ALLOWED_LISTEN_CHANNELS = new Set([
  'hardware:scanner:scan',
  'hardware:nfc:read',
  'sync:started',
  'sync:complete',
  'sync:online',
]);

// ─── Validation des payloads ──────────────────────────────────────────────────

function assertString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`IPC: "${field}" doit être une chaîne non vide`);
  }
  return value.trim();
}

function assertObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`IPC: "${field}" doit être un objet`);
  }
  return value as Record<string, unknown>;
}

// ─── Bridge exposé au renderer ────────────────────────────────────────────────

const api = {
  // ─── Invocation sécurisée ──────────────────────────────────────────────────

  invoke: (channel: string, payload?: unknown): Promise<unknown> => {
    if (!ALLOWED_INVOKE_CHANNELS.has(channel)) {
      return Promise.reject(new Error(`Canal IPC non autorisé : "${channel}"`));
    }
    return ipcRenderer.invoke(channel, payload);
  },

  // ─── Abonnement sécurisé ──────────────────────────────────────────────────

  on: (channel: string, listener: (...args: unknown[]) => void): (() => void) => {
    if (!ALLOWED_LISTEN_CHANNELS.has(channel)) {
      console.warn(`[preload] Canal d'écoute non autorisé : "${channel}"`);
      return () => {};
    }
    const sub = (_event: Electron.IpcRendererEvent, ...args: unknown[]) =>
      listener(...args);
    ipcRenderer.on(channel, sub);
    return () => ipcRenderer.removeListener(channel, sub);
  },

  // ─── Hardware ─────────────────────────────────────────────────────────────

  hardware: {
    getPrinterStatus: () =>
      ipcRenderer.invoke('hardware:printer:status'),

    printReceipt: (data: unknown) => {
      assertObject(data, 'receiptData');
      return ipcRenderer.invoke('hardware:printer:print', data);
    },

    getScannerStatus: () =>
      ipcRenderer.invoke('hardware:scanner:status'),

    getNfcStatus: () =>
      ipcRenderer.invoke('hardware:nfc:status'),

    onBarcodeScan: (callback: (barcode: string) => void): (() => void) => {
      const sub = (_e: Electron.IpcRendererEvent, barcode: string) => {
        if (typeof barcode === 'string' && barcode.length > 0) {
          callback(barcode);
        }
      };
      ipcRenderer.on('hardware:scanner:scan', sub);
      return () => ipcRenderer.removeListener('hardware:scanner:scan', sub);
    },

    onNfcRead: (callback: (data: Record<string, unknown>) => void): (() => void) => {
      const sub = (_e: Electron.IpcRendererEvent, data: unknown) => {
        if (data && typeof data === 'object') {
          callback(data as Record<string, unknown>);
        }
      };
      ipcRenderer.on('hardware:nfc:read', sub);
      return () => ipcRenderer.removeListener('hardware:nfc:read', sub);
    },
  },

  // ─── Sync ─────────────────────────────────────────────────────────────────

  sync: {
    getStatus: () =>
      ipcRenderer.invoke('sync:status'),

    addToQueue: (operation: string, payload: unknown) => {
      assertString(operation, 'operation');
      assertObject(payload, 'payload');
      return ipcRenderer.invoke('sync:queue:add', { operation, payload });
    },

    flush: () =>
      ipcRenderer.invoke('sync:queue:flush'),

    retryFailed: () =>
      ipcRenderer.invoke('sync:retry-failed'),

    onStarted: (callback: () => void): (() => void) => {
      const sub = () => callback();
      ipcRenderer.on('sync:started', sub);
      return () => ipcRenderer.removeListener('sync:started', sub);
    },

    onComplete: (callback: (result: unknown) => void): (() => void) => {
      const sub = (_e: Electron.IpcRendererEvent, result: unknown) =>
        callback(result);
      ipcRenderer.on('sync:complete', sub);
      return () => ipcRenderer.removeListener('sync:complete', sub);
    },

    onOnline: (callback: () => void): (() => void) => {
      const sub = () => callback();
      ipcRenderer.on('sync:online', sub);
      return () => ipcRenderer.removeListener('sync:online', sub);
    },
  },

  // ─── Commandes locales ─────────────────────────────────────────────────────

  orders: {
    createLocal: (order: unknown) => {
      assertObject(order, 'order');
      return ipcRenderer.invoke('orders:create-local', order);
    },
    getPending: () =>
      ipcRenderer.invoke('orders:get-pending'),
  },

  // ─── App info ─────────────────────────────────────────────────────────────

  app: {
    version:  process.versions.electron,
    platform: process.platform,
  },
} as const;

contextBridge.exposeInMainWorld('electronAPI', api);

// Déclaration de type pour le renderer
declare global {
  interface Window {
    electronAPI: typeof api;
  }
}
