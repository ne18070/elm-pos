'use client';

import { useCallback, useEffect, useState } from 'react';

interface Options {
  /** Largeur initiale si rien en storage (px) */
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  /** Clé localStorage — si absente, aucune persistance */
  storageKey?: string;
  /** Côté du panneau redimensionné : 'right' = poignée sur son bord gauche */
  side?: 'right' | 'left';
}

/**
 * Largeur d'un panneau latéral ajustable à la souris/au doigt via une poignée.
 * La largeur est bornée à [minWidth, maxWidth] et, si `storageKey` est fourni,
 * mémorisée dans localStorage (ré-hydratée après montage pour éviter tout
 * mismatch SSR).
 */
export function useResizablePanel({
  defaultWidth,
  minWidth,
  maxWidth,
  storageKey,
  side = 'right',
}: Options) {
  const clamp = useCallback(
    (w: number) => Math.min(maxWidth, Math.max(minWidth, w)),
    [minWidth, maxWidth],
  );

  const [width, setWidth] = useState(defaultWidth);
  const [dragging, setDragging] = useState(false);

  // Ré-hydratation depuis localStorage après montage
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw != null) {
        const n = parseFloat(raw);
        if (Number.isFinite(n)) setWidth(clamp(n));
      }
    } catch {
      /* localStorage indisponible */
    }
  }, [storageKey, clamp]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setDragging(true);

      const move = (ev: PointerEvent) => {
        const w = side === 'right' ? window.innerWidth - ev.clientX : ev.clientX;
        setWidth(clamp(w));
      };
      const up = () => {
        setDragging(false);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        setWidth((w) => {
          if (storageKey) {
            try {
              localStorage.setItem(storageKey, String(Math.round(w)));
            } catch {
              /* noop */
            }
          }
          return w;
        });
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [clamp, side, storageKey],
  );

  // Curseur + anti-sélection pendant le glissement
  useEffect(() => {
    if (!dragging) return;
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [dragging]);

  const reset = useCallback(() => {
    setWidth(defaultWidth);
    if (storageKey) {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* noop */
      }
    }
  }, [defaultWidth, storageKey]);

  return { width, dragging, onPointerDown, reset };
}
