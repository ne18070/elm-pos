'use client';

import { useEffect, useRef } from 'react';

interface BarcodeListenerProps {
  onScan: (barcode: string) => void;
}

/**
 * Détection scanner code-barres HID (mode clavier)
 *
 * Fonctionnement :
 * - Un scanner HID envoie les touches très vite (< 50ms entre chaque)
 * - Suivi d'un Enter (ou parfois Tab)
 * - On bufferise les touches, on émet quand on reçoit Enter
 *
 * On ignore les touches si le focus est dans un champ de saisie.
 * Pas de dépendance native, pas de process main — 100% renderer.
 */
export function BarcodeListener({ onScan }: BarcodeListenerProps) {
  const bufferRef = useRef('');
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Timestamp de la dernière touche pour détecter la vitesse "scanner"
  const lastKeyRef = useRef<number>(0);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const now = Date.now();

      // Ignorer si focus dans un champ interactif
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.key === 'Enter' || e.key === 'Tab') {
        const code = bufferRef.current.trim();
        bufferRef.current = '';
        if (timerRef.current) clearTimeout(timerRef.current);
        // Émettre uniquement si le code a au moins 3 caractères
        if (code.length >= 3) {
          onScan(code);
        }
        return;
      }

      // N'accumuler que les caractères imprimables
      if (e.key.length === 1) {
        // Heuristique : un scanner envoie les touches en < 50ms
        // Si l'intervalle est trop long, c'est probablement une saisie manuelle
        const interval = now - lastKeyRef.current;
        lastKeyRef.current = now;

        // Reset du buffer si la frappe est trop lente (humain)
        if (bufferRef.current.length > 0 && interval > 80) {
          bufferRef.current = '';
        }

        bufferRef.current += e.key;

        // Timeout de sécurité : vider le buffer si pas de Enter dans 300ms
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          bufferRef.current = '';
        }, 300);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [onScan]);

  return null;
}
