import type { IpcMain } from 'electron';
import type { IpcResponse, ReceiptData } from '../../types';
import { PrinterManager, PrinterError, type PrinterConfig } from '../../hardware/printer';
import { ScannerManager } from '../../hardware/scanner';
import { NfcManager } from '../../hardware/nfc';

// Instances singletons — initialisées à la demande
let printerManager: PrinterManager | null = null;
let scannerManager: ScannerManager | null = null;
let nfcManager: NfcManager | null = null;

const getPrinter = (): PrinterManager =>
  (printerManager ??= new PrinterManager());
const getScanner = (): ScannerManager =>
  (scannerManager ??= new ScannerManager());
const getNfc = (): NfcManager =>
  (nfcManager ??= new NfcManager());

export function registerHardwareHandlers(ipcMain: IpcMain): void {
  // ─── Imprimante ──────────────────────────────────────────────────────────────

  ipcMain.handle('hardware:printer:status', async (): Promise<IpcResponse> => {
    try {
      const status = await getPrinter().getStatus();
      return { success: true, data: status };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle(
    'hardware:printer:print',
    async (_event, payload: ReceiptData & { printerConfig?: PrinterConfig }): Promise<IpcResponse> => {
      try {
        const { printerConfig, ...receiptData } = payload;
        await getPrinter().printReceipt(receiptData as ReceiptData, printerConfig);
        return { success: true };
      } catch (err) {
        if (err instanceof PrinterError) {
          return { success: false, error: mapPrinterError(err) };
        }
        return { success: false, error: String(err) };
      }
    }
  );

  ipcMain.handle(
    'hardware:printer:test',
    async (_event, { ip, port }: { ip: string; port: number }): Promise<IpcResponse> => {
      try {
        const result = await getPrinter().testConnection(ip, port);
        return { success: result.connected, data: result };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    }
  );

  // ─── Scanner ─────────────────────────────────────────────────────────────────

  ipcMain.handle('hardware:scanner:status', (): IpcResponse => {
    try {
      const status = getScanner().getStatus();
      return { success: true, data: status };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // ─── NFC ─────────────────────────────────────────────────────────────────────

  ipcMain.handle('hardware:nfc:status', (): IpcResponse => {
    try {
      const status = getNfc().getStatus();
      return { success: true, data: status };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });
}

/** Cleanup à l'arrêt de l'application */
export function destroyHardware(): void {
  scannerManager?.destroy();
  nfcManager?.destroy();
  printerManager = null;
  scannerManager = null;
  nfcManager     = null;
}

function mapPrinterError(err: PrinterError): string {
  switch (err.code) {
    case 'NOT_FOUND':     return "Imprimante non trouvée — vérifiez la connexion USB";
    case 'DRIVER_MISSING': return "Pilote ESC/POS manquant — installez escpos-usb";
    case 'OPEN_FAILED':   return "Impossible d'ouvrir l'imprimante — vérifiez les permissions";
    case 'PRINT_FAILED':  return "Erreur lors de l'impression — réessayez";
    case 'TIMEOUT':       return "Délai d'impression dépassé — imprimante bloquée ?";
    default:              return err.message;
  }
}
