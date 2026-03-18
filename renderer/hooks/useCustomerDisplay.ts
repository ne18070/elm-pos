'use client';

import { useEffect, useRef } from 'react';
import { useCartStore } from '@/store/cart';

export interface DisplayItem {
  name: string;
  quantity: number;
  price: number;
  total: number;
}

export interface DisplayState {
  screen: 'idle' | 'cart' | 'payment' | 'confirm';
  businessName?: string;
  logoUrl?: string;
  currency?: string;
  items?: DisplayItem[];
  subtotal?: number;
  discount?: number;
  tax?: number;
  total?: number;
  amountPaid?: number;
  change?: number;
}

const CHANNEL_NAME = 'elm-pos-display';

/**
 * Synchronise l'écran client via BroadcastChannel — fonctionne directement
 * entre BrowserWindows du même origin sans passer par IPC/main process.
 */
export function useCustomerDisplay(options: {
  businessName: string;
  logoUrl?: string;
  currency: string;
  taxRate: number;
}) {
  const optsRef = useRef(options);
  optsRef.current = options;

  useEffect(() => {
    const channel = new BroadcastChannel(CHANNEL_NAME);

    function buildAndSend() {
      const { businessName, logoUrl, currency, taxRate } = optsRef.current;
      const store = useCartStore.getState();
      const { items } = store;

      const state: DisplayState = items.length === 0
        ? { screen: 'idle', businessName, logoUrl, currency }
        : {
            screen:       'cart',
            businessName,
            logoUrl,
            currency,
            items: items.map((i) => ({
              name:     i.name,
              quantity: i.quantity,
              price:    i.price,
              total:    i.price * i.quantity,
            })),
            subtotal: store.subtotal(),
            discount: store.discountAmount(),
            tax:      store.taxAmount(taxRate),
            total:    store.total(taxRate),
          };

      channel.postMessage(state);

      // Aussi via IPC pour compatibilité si BroadcastChannel ne passe pas
      window.electronAPI?.display?.sendUpdate(state);
    }

    // Envoi immédiat
    buildAndSend();

    // Répondre quand l'écran client signale qu'il est prêt
    channel.onmessage = (e) => {
      if (e.data === 'ready') buildAndSend();
    };

    // Synchronisation sur chaque changement du panier
    const unsubscribe = useCartStore.subscribe(buildAndSend);

    return () => {
      unsubscribe();
      channel.close();
    };
  }, []);

  function sendPaymentConfirm(amountPaid: number, change: number, orderTotal: number) {
    const { businessName, currency } = optsRef.current;
    const state: DisplayState = {
      screen: 'payment',
      businessName,
      currency,
      total:  orderTotal,
      amountPaid,
      change,
    };
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(state);
    window.electronAPI?.display?.sendUpdate(state);
    // Fermer immédiatement, message one-shot
    setTimeout(() => channel.close(), 100);
  }

  return { sendPaymentConfirm };
}
