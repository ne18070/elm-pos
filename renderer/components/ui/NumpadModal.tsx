'use client';

import { Delete, Check } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface NumpadModalProps {
  value: string;
  label?: string;
  hint?: string;          // ex: "Total : 4 300 FCFA"
  currency?: string;
  onDigit: (v: string) => void;  // nouvelle valeur complète
  onClose: () => void;
}

const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '⌫'];

export function NumpadModal({ value, label, hint, onDigit, onClose }: NumpadModalProps) {

  function press(key: string) {
    if (key === '⌫') {
      onDigit(value.slice(0, -1));
      return;
    }
    if (key === '.') {
      if (value.includes('.')) return;
      onDigit((value || '0') + '.');
      return;
    }
    // Éviter plusieurs zéros en tête
    if (value === '0') {
      onDigit(key);
      return;
    }
    // Limiter 2 décimales
    const dotIdx = value.indexOf('.');
    if (dotIdx !== -1 && value.length - dotIdx > 2) return;

    onDigit(value + key);
  }

  const display = value || '0';

  return (
    /* Overlay sombre */
    <div
      className="absolute inset-0 z-50 flex items-end justify-center bg-black/60 rounded-2xl"
      onClick={onClose}
    >
      <div
        className="w-full bg-surface-card border-t border-surface-border rounded-b-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Affichage valeur */}
        <div className="px-5 pt-4 pb-2 border-b border-surface-border">
          {label && <p className="text-xs text-slate-500 mb-0.5">{label}</p>}
          <p className="text-3xl font-bold text-white tabular-nums tracking-tight">{display}</p>
          {hint && <p className="text-xs text-slate-500 mt-0.5">{hint}</p>}
        </div>

        {/* Grille 3×4 */}
        <div className="grid grid-cols-3 gap-px bg-surface-border p-px">
          {KEYS.map((k) => (
            <button
              key={k}
              onClick={() => press(k)}
              className={`flex items-center justify-center h-14 text-xl font-semibold transition-colors select-none
                ${k === '⌫'
                  ? 'bg-surface-input text-status-warning hover:bg-badge-warning'
                  : 'bg-surface-card text-white hover:bg-surface-hover active:bg-surface-input'
                }`}
            >
              {k === '⌫' ? <Delete className="w-5 h-5" /> : k}
            </button>
          ))}
        </div>

        {/* Boutons bas */}
        <div className="grid grid-cols-2 gap-px bg-surface-border p-px">
          <button
            onClick={onClose}
            className="h-12 bg-surface-input text-content-secondary hover:bg-surface-hover font-medium transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={onClose}
            className="h-12 bg-brand-600 text-white hover:bg-brand-500 font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            <Check className="w-5 h-5" /> OK
          </button>
        </div>
      </div>
    </div>
  );
}
