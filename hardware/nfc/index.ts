import type { NfcStatus } from '../../types';

type NfcReadCallback = (data: Record<string, unknown>) => void;

/**
 * NFC Reader Manager using nfc-pcsc
 *
 * Supports:
 * - PC/SC compatible NFC readers (ACR122U, ACR1252U, etc.)
 * - Tag reading (UID + NDEF records)
 * - Card detection (for loyalty cards, payment cards)
 */
export class NfcManager {
  private callbacks: NfcReadCallback[] = [];
  private nfc: unknown = null;
  private readerName: string | null = null;
  private connected = false;

  constructor() {
    this.initNfc();
  }

  private initNfc(): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { NFC } = require('nfc-pcsc');
      this.nfc = new NFC();

      (this.nfc as {
        on: (event: string, handler: (...args: unknown[]) => void) => void;
      }).on('reader', (reader: Record<string, unknown>) => {
        this.readerName = reader['name'] as string;
        this.connected = true;

        const readerObj = reader as {
          on: (event: string, handler: (...args: unknown[]) => void) => void;
          read: (block: number, length: number) => Promise<Buffer>;
        };

        readerObj.on('card', async (card: Record<string, unknown>) => {
          const uid = (card['uid'] as string) || 'unknown';
          let ndefData: unknown = null;

          try {
            // Read NDEF data if available (4 blocks of 4 bytes)
            const data = await readerObj.read(4, 16);
            ndefData = data.toString('hex');
          } catch {
            // Card may not have NDEF data
          }

          this.emitRead({
            uid,
            type: card['type'] ?? 'unknown',
            standard: card['standard'] ?? 'unknown',
            ndef: ndefData,
            timestamp: new Date().toISOString(),
          });
        });

        readerObj.on('card.off', () => {
          // Card removed — emit for cleanup if needed
        });

        readerObj.on('error', (err: unknown) => {
          console.error('[NFC] Reader error:', err);
        });
      });

      (this.nfc as { on: (event: string, handler: (...args: unknown[]) => void) => void })
        .on('error', (err: unknown) => {
          console.error('[NFC] Error:', err);
          this.connected = false;
        });
    } catch {
      // nfc-pcsc not available or no reader connected
      this.connected = false;
    }
  }

  private emitRead(data: Record<string, unknown>): void {
    for (const cb of this.callbacks) {
      cb(data);
    }
  }

  onRead(callback: NfcReadCallback): () => void {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter((c) => c !== callback);
    };
  }

  getStatus(): NfcStatus {
    return {
      connected: this.connected,
      reader: this.readerName ?? undefined,
    };
  }

  destroy(): void {
    this.callbacks = [];
    try {
      (this.nfc as { close?: () => void } | null)?.close?.();
    } catch {
      // ignore
    }
  }
}
