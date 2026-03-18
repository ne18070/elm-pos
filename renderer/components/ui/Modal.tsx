'use client';

import { useEffect, useRef, useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /**
   * footer peut être un ReactNode statique OU une fonction qui reçoit requestClose.
   * Utilisez la forme fonction pour que le bouton "Annuler" passe par le guard.
   */
  footer?: React.ReactNode | ((requestClose: () => void) => React.ReactNode);
  /**
   * Quand true : le backdrop et Echap ne ferment pas le modal,
   * le bouton × demande une confirmation avant de fermer.
   */
  guard?: boolean;
}

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export function Modal({ title, onClose, children, size = 'md', footer, guard = false }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [confirming, setConfirming] = useState(false);

  function requestClose() {
    if (guard) {
      setConfirming(true);
    } else {
      onClose();
    }
  }

  // Fermer sur Echap
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        requestClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [guard]);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      // Backdrop : bloqué si guard, sinon ferme
      onClick={(e) => { if (e.target === overlayRef.current && !guard) onClose(); }}
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Boite de dialogue */}
      <div
        className={cn(
          'relative w-full bg-surface-card rounded-2xl shadow-card border border-surface-border',
          'flex flex-col max-h-[90vh]',
          SIZES[size]
        )}
      >
        {/* En-tête */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border shrink-0">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button
            onClick={requestClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-surface-hover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Contenu */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>

        {/* Pied de page */}
        {footer && (
          <div className="px-6 py-4 border-t border-surface-border shrink-0 flex items-center justify-end gap-3">
            {typeof footer === 'function' ? footer(requestClose) : footer}
          </div>
        )}

        {/* Confirmation fermeture */}
        {confirming && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/70 backdrop-blur-sm">
            <div className="bg-surface-card border border-surface-border rounded-2xl p-6 mx-6 space-y-4 shadow-2xl">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-white">Annuler la saisie ?</p>
                  <p className="text-sm text-slate-400 mt-1">
                    Les informations saisies seront perdues.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirming(false)}
                  className="btn-secondary flex-1"
                  autoFocus
                >
                  Continuer la saisie
                </button>
                <button
                  onClick={() => { setConfirming(false); onClose(); }}
                  className="flex-1 h-10 px-4 rounded-xl bg-red-900/30 border border-red-800
                             text-red-400 hover:bg-red-900/50 transition-colors text-sm font-medium"
                >
                  Oui, annuler
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
