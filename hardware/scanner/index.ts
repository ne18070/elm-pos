import type { ScannerStatus } from '../../types';

/**
 * Scanner Manager — HID uniquement (mode clavier)
 *
 * Les scanners code-barres USB/Bluetooth en mode HID émulent un clavier :
 * ils envoient les caractères du code-barres + Enter très rapidement.
 *
 * La détection réelle se fait dans le renderer via BarcodeListener.tsx,
 * qui écoute les événements clavier avec un buffer temporel.
 *
 * Ce manager côté main process sert uniquement à :
 * - Rapporter le statut (toujours "connecté" en mode HID)
 * - Éventuellement forwarder un scan simulé pour les tests
 */
export class ScannerManager {
  private testCallbacks: Array<(barcode: string) => void> = [];

  getStatus(): ScannerStatus {
    return {
      connected: true,
      type: 'hid',
    };
  }

  /**
   * Pour les tests / simulations uniquement.
   * En production, la détection est faite dans le renderer.
   */
  onScan(callback: (barcode: string) => void): () => void {
    this.testCallbacks.push(callback);
    return () => {
      this.testCallbacks = this.testCallbacks.filter((c) => c !== callback);
    };
  }

  /** Simuler un scan (tests automatisés) */
  simulateScan(barcode: string): void {
    for (const cb of this.testCallbacks) cb(barcode);
  }

  destroy(): void {
    this.testCallbacks = [];
  }
}
