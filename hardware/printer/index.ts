import * as net from 'net';
import type { PrinterStatus, ReceiptData } from '../../types';
import { formatReceiptLines } from './escpos';

export interface PrinterConfig {
  type: 'usb' | 'network';
  ip?: string;
  port?: number;
}

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

  async printReceipt(data: ReceiptData, config?: PrinterConfig, attempt = 1): Promise<void> {
    // Mode réseau TCP/IP
    if (config?.type === 'network' && config.ip) {
      return this.doPrintNetwork(data, config.ip, config.port ?? 9100);
    }

    // Mode USB (défaut)
    if (!loadEscpos() || !USB) {
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
        await delay(500);
        return this.printReceipt(data, config, attempt + 1);
      }
      throw new PrinterError(
        `Échec impression après ${MAX_RETRIES} tentatives : ${err}`,
        'PRINT_FAILED'
      );
    }
  }

  /** Test de connexion TCP — renvoie la latence si succès */
  async testConnection(ip: string, port: number): Promise<{ connected: boolean; latency?: number; error?: string }> {
    return new Promise((resolve) => {
      const start = Date.now();
      const socket = new net.Socket();
      const TIMEOUT = 3000;

      socket.setTimeout(TIMEOUT);

      socket.connect(port, ip, () => {
        const latency = Date.now() - start;
        socket.destroy();
        resolve({ connected: true, latency });
      });

      socket.on('error', (err) => {
        socket.destroy();
        resolve({ connected: false, error: err.message });
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve({ connected: false, error: `Délai dépassé (${TIMEOUT}ms)` });
      });
    });
  }

  /** Impression réseau via socket TCP — protocole ESC/POS brut */
  private doPrintNetwork(data: ReceiptData, ip: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const lines = formatReceiptLines(data);
      const ESC = '\x1b';
      const GS  = '\x1d';

      const W = 42; // largeur 80mm standard
      const center = (s: string) => ' '.repeat(Math.max(0, Math.floor((W - s.length) / 2))) + s;
      const row    = (l: string, r: string) => l.slice(0, W - r.length - 1).padEnd(W - r.length) + r;
      const divider = '-'.repeat(W);

      const parts: string[] = [
        `${ESC}@`,                                      // init
        `${ESC}a\x01${ESC}E\x01`,                      // center + bold
        center(lines.businessName) + '\n',
        `${ESC}E\x00${ESC}a\x00`,                      // bold off + left
        lines.address  ? center(lines.address)  + '\n' : '',
        lines.phone    ? center(lines.phone)    + '\n' : '',
        divider + '\n',
        `Date    : ${lines.date}\n`,
        `Commande: #${lines.orderId}\n`,
        `Caissier: ${lines.cashierName}\n`,
        divider + '\n',
        ...lines.items.map((i) => row(`${i.name} x${i.qty}`, i.total) + '\n'),
        divider + '\n',
        row('Sous-total', lines.subtotal) + '\n',
        lines.discount ? row('Remise', `-${lines.discount}`) + '\n' : '',
        lines.tax      ? row('TVA', lines.tax)               + '\n' : '',
        `${ESC}E\x01`,                                  // bold
        row('TOTAL', lines.total) + '\n',
        `${ESC}E\x00`,                                  // bold off
        divider + '\n',
        `Paiement : ${lines.paymentMethod}\n`,
        divider + '\n',
        lines.footer ? center(lines.footer) + '\n' : '',
        center('Merci de votre visite !') + '\n\n\n',
        `${GS}V\x41\x03`,                              // coupe papier partiel
      ];

      const payload = Buffer.from(parts.join(''), 'utf8');

      const socket = new net.Socket();
      socket.setTimeout(PRINT_TIMEOUT_MS);

      socket.connect(port, ip, () => {
        socket.write(payload, (err) => {
          socket.destroy();
          if (err) reject(new PrinterError(`Envoi réseau échoué : ${err.message}`, 'PRINT_FAILED'));
          else resolve();
        });
      });

      socket.on('error', (err) => {
        socket.destroy();
        reject(new PrinterError(`Connexion réseau impossible : ${err.message}`, 'OPEN_FAILED'));
      });

      socket.on('timeout', () => {
        socket.destroy();
        reject(new PrinterError('Délai réseau dépassé', 'TIMEOUT'));
      });
    });
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
