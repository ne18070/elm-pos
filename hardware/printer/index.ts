import type { PrinterStatus, ReceiptData } from '../../types';
import { formatReceiptLines } from './escpos';

// Chargement dynamique pour éviter les crashs si les packages ne sont pas installés
// eslint-disable-next-line @typescript-eslint/no-require-imports
let escpos: typeof import('escpos') | null = null;
// eslint-disable-next-line @typescript-eslint/no-require-imports
let USB: { list: () => unknown[]; new (): unknown } | null = null;

function loadEscpos(): boolean {
  if (escpos && USB) return true;
  try {
    escpos = require('escpos');
    USB    = require('escpos-usb');
    return true;
  } catch {
    return false;
  }
}

// ─── PrinterError ─────────────────────────────────────────────────────────────

export class PrinterError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'NOT_FOUND'
      | 'DRIVER_MISSING'
      | 'OPEN_FAILED'
      | 'PRINT_FAILED'
      | 'TIMEOUT'
  ) {
    super(message);
    this.name = 'PrinterError';
  }
}

// ─── PrinterManager ───────────────────────────────────────────────────────────

const PRINT_TIMEOUT_MS = 8_000;
const MAX_RETRIES = 2;

export class PrinterManager {
  async getStatus(): Promise<PrinterStatus> {
    if (!loadEscpos() || !USB) {
      return {
        connected: false,
        error: 'Pilote ESC/POS non installé (escpos-usb)',
      };
    }
    try {
      const devices = (USB as { list: () => unknown[] }).list();
      return devices.length > 0
        ? { connected: true, name: 'Imprimante USB thermique' }
        : { connected: false };
    } catch (err) {
      return { connected: false, error: String(err) };
    }
  }

  async printReceipt(data: ReceiptData, attempt = 1): Promise<void> {
    if (!loadEscpos() || !USB) {
      // Pas de crash — juste loggé (fallback texte en dev)
      console.log('[PRINTER] Fallback texte :\n', this.textFallback(data));
      return;
    }

    const devices = (USB as { list: () => unknown[] }).list();
    if (devices.length === 0) {
      throw new PrinterError('Aucune imprimante USB détectée', 'NOT_FOUND');
    }

    try {
      await this.doPrint(data);
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        // Retry avec délai court
        await delay(500);
        return this.printReceipt(data, attempt + 1);
      }
      throw new PrinterError(
        `Échec impression après ${MAX_RETRIES} tentatives : ${err}`,
        'PRINT_FAILED'
      );
    }
  }

  private doPrint(data: ReceiptData): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new PrinterError('Délai d\'impression dépassé', 'TIMEOUT'));
      }, PRINT_TIMEOUT_MS);

      try {
        const device  = new (USB as new () => unknown)();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const printer = new (escpos as any).Printer(device) as any;
        const lines = formatReceiptLines(data);

        (device as { open: (cb: (err?: Error) => void) => void }).open((err) => {
          if (err) {
            clearTimeout(timeoutId);
            return reject(new PrinterError(`Ouverture impossible : ${err}`, 'OPEN_FAILED'));
          }

          try {
            let p = printer
              .font('a').align('ct').style('bu').size(1, 1)
              .text(lines.businessName).style('normal');

            if (lines.address) p = p.text(lines.address);
            if (lines.phone)   p = p.text(lines.phone);

            p = p
              .drawLine()
              .align('lt')
              .text(`Date    : ${lines.date}`)
              .text(`Commande: #${lines.orderId}`)
              .text(`Caissier: ${lines.cashierName}`)
              .drawLine();

            for (const item of lines.items) {
              p = p.tableCustom([
                { text: item.name,        align: 'LEFT',   width: 0.50 },
                { text: `×${item.qty}`,   align: 'CENTER', width: 0.15 },
                { text: item.total,       align: 'RIGHT',  width: 0.35 },
              ]);
            }

            p = p.drawLine()
              .tableCustom([
                { text: 'Sous-total', align: 'LEFT', width: 0.5 },
                { text: lines.subtotal,  align: 'RIGHT', width: 0.5 },
              ]);

            if (lines.discount) {
              p = p.tableCustom([
                { text: 'Remise', align: 'LEFT', width: 0.5 },
                { text: `-${lines.discount}`, align: 'RIGHT', width: 0.5 },
              ]);
            }
            if (lines.tax) {
              p = p.tableCustom([
                { text: 'TVA', align: 'LEFT', width: 0.5 },
                { text: lines.tax, align: 'RIGHT', width: 0.5 },
              ]);
            }

            p = p
              .style('bu')
              .tableCustom([
                { text: 'TOTAL', align: 'LEFT', width: 0.5 },
                { text: lines.total, align: 'RIGHT', width: 0.5 },
              ])
              .style('normal')
              .drawLine()
              .text(`Paiement : ${lines.paymentMethod}`)
              .drawLine()
              .align('ct');

            if (lines.footer) p = p.text(lines.footer);

            p.text('Merci de votre visite !').cut().close(() => {
              clearTimeout(timeoutId);
              resolve();
            });
          } catch (printErr) {
            clearTimeout(timeoutId);
            reject(new PrinterError(String(printErr), 'PRINT_FAILED'));
          }
        });
      } catch (err) {
        clearTimeout(timeoutId);
        reject(new PrinterError(String(err), 'PRINT_FAILED'));
      }
    });
  }

  /** Fallback texte brut (développement, aucune imprimante) */
  private textFallback(data: ReceiptData): string {
    const { generateTextReceipt } = require('./escpos');
    return generateTextReceipt(data);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
