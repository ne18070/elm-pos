import { contextBridge, ipcRenderer } from 'electron';

// ─── Canaux IPC autorisés ────────────────────────────────────────────────────

const ALLOWED_INVOKE_CHANNELS = new Set([
  'hardware:printer:status',
  'hardware:printer:print',
  'hardware:printer:test',
  'hardware:cashdrawer:open',
  'hardware:scanner:status',
  'hardware:nfc:status',
  'sync:status',
  'sync:queue:add',
  'sync:queue:flush',
  'sync:retry-failed',
  'orders:create-local',
  'orders:get-pending',
  'orders:mark-synced',
  // Abonnement (sécurité offline)
  'subscription:save',
  'subscription:check',
  'subscription:clear',
  // Écran client
  'display:open',
  'display:close',
  'display:status',
  'display:get-state',
  'app:version',
]);

const ALLOWED_LISTEN_CHANNELS = new Set([
  'hardware:scanner:scan',
  'hardware:nfc:read',
  'sync:started',
  'sync:complete',
  'sync:online',
  // Écran client
  'display:data',
]);

// ─── Validation ──────────────────────────────────────────────────────────────

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

// ─── Bridge ──────────────────────────────────────────────────────────────────

const api = {
  invoke: (channel: string, payload?: unknown): Promise<unknown> => {
    if (!ALLOWED_INVOKE_CHANNELS.has(channel)) {
      return Promise.reject(new Error(`Canal IPC non autorisé : "${channel}"`));
    }
    return ipcRenderer.invoke(channel, payload);
  },

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

  // ─── Hardware ───────────────────────────────────────────────────────────────

  hardware: {
    getPrinterStatus: () => ipcRenderer.invoke('hardware:printer:status'),

    printReceipt: (data: unknown) => {
      assertObject(data, 'receiptData');
      return ipcRenderer.invoke('hardware:printer:print', data);
    },

    testPrinterConnection: (ip: string, port: number) =>
      ipcRenderer.invoke('hardware:printer:test', { ip, port }),

    openCashDrawer: (printerConfig?: unknown) =>
      ipcRenderer.invoke('hardware:cashdrawer:open', { printerConfig }),

    getScannerStatus: () => ipcRenderer.invoke('hardware:scanner:status'),
    getNfcStatus:     () => ipcRenderer.invoke('hardware:nfc:status'),

    onBarcodeScan: (callback: (barcode: string) => void): (() => void) => {
      const sub = (_e: Electron.IpcRendererEvent, barcode: string) => {
        if (typeof barcode === 'string' && barcode.length > 0) callback(barcode);
      };
      ipcRenderer.on('hardware:scanner:scan', sub);
      return () => ipcRenderer.removeListener('hardware:scanner:scan', sub);
    },

    onNfcRead: (callback: (data: Record<string, unknown>) => void): (() => void) => {
      const sub = (_e: Electron.IpcRendererEvent, data: unknown) => {
        if (data && typeof data === 'object') callback(data as Record<string, unknown>);
      };
      ipcRenderer.on('hardware:nfc:read', sub);
      return () => ipcRenderer.removeListener('hardware:nfc:read', sub);
    },
  },

  // ─── Sync ────────────────────────────────────────────────────────────────────

  sync: {
    getStatus:   () => ipcRenderer.invoke('sync:status'),
    flush:       () => ipcRenderer.invoke('sync:queue:flush'),
    retryFailed: () => ipcRenderer.invoke('sync:retry-failed'),

    addToQueue: (operation: string, payload: unknown) => {
      assertString(operation, 'operation');
      assertObject(payload, 'payload');
      return ipcRenderer.invoke('sync:queue:add', { operation, payload });
    },

    onStarted: (cb: () => void) => {
      const sub = () => cb();
      ipcRenderer.on('sync:started', sub);
      return () => ipcRenderer.removeListener('sync:started', sub);
    },
    onComplete: (cb: (r: unknown) => void) => {
      const sub = (_e: Electron.IpcRendererEvent, r: unknown) => cb(r);
      ipcRenderer.on('sync:complete', sub);
      return () => ipcRenderer.removeListener('sync:complete', sub);
    },
    onOnline: (cb: () => void) => {
      const sub = () => cb();
      ipcRenderer.on('sync:online', sub);
      return () => ipcRenderer.removeListener('sync:online', sub);
    },
  },

  // ─── Commandes locales ───────────────────────────────────────────────────────

  orders: {
    createLocal: (order: unknown) => {
      assertObject(order, 'order');
      return ipcRenderer.invoke('orders:create-local', order);
    },
    getPending: () => ipcRenderer.invoke('orders:get-pending'),
  },

  // ─── Écran client ────────────────────────────────────────────────────────────

  display: {
    /** Envoyer l'état du panier/paiement à l'écran client (fire & forget) */
    sendUpdate: (state: unknown): void => {
      ipcRenderer.send('display:update', state);
    },

    /** Recevoir les données sur l'écran client */
    onData: (callback: (state: unknown) => void): (() => void) => {
      const sub = (_e: Electron.IpcRendererEvent, state: unknown) => callback(state);
      ipcRenderer.on('display:data', sub);
      return () => ipcRenderer.removeListener('display:data', sub);
    },

    open:      () => ipcRenderer.invoke('display:open'),
    close:     () => ipcRenderer.invoke('display:close'),
    getStatus: () => ipcRenderer.invoke('display:status'),
    /** Récupère le dernier état connu (pour sync initiale depuis l'écran client) */
    getState:  () => ipcRenderer.invoke('display:get-state'),
  },

  // ─── App ─────────────────────────────────────────────────────────────────────

  app: {
    getVersion: () => ipcRenderer.invoke('app:version'),
    version:  process.versions.electron,
    platform: process.platform,
  },
} as const;

contextBridge.exposeInMainWorld('electronAPI', api);

declare global {
  interface Window {
    electronAPI: typeof api;
  }
}
