'use client';

import { useState } from 'react';

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
          <p className="text-sm text-content-primary leading-relaxed">{dlg.message}</p>
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
                  ? 'bg-red-600 hover:bg-red-500'
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
