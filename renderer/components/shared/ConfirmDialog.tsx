'use client';

import { useState } from 'react';
import { create } from 'zustand';

interface ConfirmDialogState {
  message: string;
  onConfirm: () => void;
  confirmLabel?: string;
  danger?: boolean;
}

/**
 * useConfirm — remplace window.confirm() par un dialog pro.
 *
 * Usage:
 *   const { askConfirm, ConfirmDialog } = useConfirm();
 *   askConfirm('Supprimer ?', () => doDelete());
 *   // dans le JSX : <ConfirmDialog />
 */
export function useConfirm() {
  const [dlg, setDlg] = useState<ConfirmDialogState | null>(null);

  function askConfirm(
    message: string,
    onConfirm: () => void,
    options?: { confirmLabel?: string; danger?: boolean }
  ) {
    setDlg({ message, onConfirm, confirmLabel: options?.confirmLabel ?? 'Confirmer', danger: options?.danger ?? true });
  }

  function ConfirmDialog() {
    if (!dlg) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
        <div className="card w-full max-w-sm p-6 space-y-5">
          <p className="text-sm text-content-primary leading-relaxed whitespace-pre-line">{dlg.message}</p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setDlg(null)}
              className="btn-secondary px-5 text-sm">
              Annuler
            </button>
            <button
              onClick={() => { setDlg(null); dlg.onConfirm(); }}
              className={`text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors
                ${dlg.danger
                  ? 'bg-status-error hover:opacity-90'
                  : 'bg-brand-600 hover:bg-brand-500'}`}>
              {dlg.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return { askConfirm, ConfirmDialog };
}

// ── Version promesse : remplace `if (!confirm(msg)) return;` sans restructurer ──
// Usage : if (!(await confirmAsync('Supprimer ?'))) return;
// Rendu par <GlobalConfirmDialog />, monté une fois dans app/layout.tsx.

interface PendingConfirm {
  message: string;
  confirmLabel: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
}

const useConfirmStore = create<{ pending: PendingConfirm | null }>(() => ({ pending: null }));

export function confirmAsync(
  message: string,
  options?: { confirmLabel?: string; danger?: boolean },
): Promise<boolean> {
  return new Promise((resolve) => {
    // Une demande encore ouverte est considérée comme annulée
    useConfirmStore.getState().pending?.resolve(false);
    useConfirmStore.setState({
      pending: {
        message,
        confirmLabel: options?.confirmLabel ?? 'Confirmer',
        danger: options?.danger ?? true,
        resolve,
      },
    });
  });
}

export function GlobalConfirmDialog() {
  const pending = useConfirmStore((st) => st.pending);
  if (!pending) return null;

  const close = (ok: boolean) => {
    useConfirmStore.setState({ pending: null });
    pending.resolve(ok);
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/60 p-4"
      onClick={() => close(false)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        className="card w-full max-w-sm p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-content-primary leading-relaxed whitespace-pre-line">{pending.message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={() => close(false)} className="btn-secondary px-5 h-11 text-sm">
            Annuler
          </button>
          <button
            autoFocus
            onClick={() => close(true)}
            className={`text-white text-sm font-semibold px-5 h-11 rounded-xl transition-colors
              ${pending.danger ? 'bg-status-error hover:opacity-90' : 'bg-brand-600 hover:bg-brand-500'}`}
          >
            {pending.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
