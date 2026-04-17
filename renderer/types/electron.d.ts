/**
 * Type declarations for window.electronAPI exposed via contextBridge in preload.ts.
 * Used by the renderer (Next.js) to get proper TypeScript support.
 */

interface ElectronDisplayAPI {
  sendUpdate: (state: unknown) => void;
  onData: (callback: (state: unknown) => void) => () => void;
  open: () => Promise<unknown>;
  close: () => Promise<unknown>;
  getStatus: () => Promise<{ open: boolean; monitors: number }>;
  getState: () => Promise<unknown>;
}

interface ElectronAPI {
  invoke: (channel: string, payload?: unknown) => Promise<unknown>;
  on: (channel: string, listener: (...args: unknown[]) => void) => () => void;
  display: ElectronDisplayAPI;
  hardware: {
    getPrinterStatus: () => Promise<unknown>;
    printReceipt: (data: unknown) => Promise<unknown>;
    getScannerStatus: () => Promise<unknown>;
    getNfcStatus: () => Promise<unknown>;
    onBarcodeScan: (callback: (barcode: string) => void) => () => void;
    onNfcRead: (callback: (data: Record<string, unknown>) => void) => () => void;
  };
  sync: {
    getStatus: () => Promise<unknown>;
    flush: () => Promise<unknown>;
    retryFailed: () => Promise<unknown>;
    addToQueue: (operation: string, payload: unknown) => Promise<unknown>;
    onStarted: (cb: () => void) => () => void;
    onComplete: (cb: (r: unknown) => void) => () => void;
    onOnline: (cb: () => void) => () => void;
  };
  orders: {
    createLocal: (order: unknown) => Promise<unknown>;
    getPending: () => Promise<unknown>;
  };
  app: {
    getVersion: () => Promise<string>;
    version: string;
    platform: string;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
