'use client';

import { useState, useRef, useEffect } from 'react';
import { Clock } from 'lucide-react';

interface HoldModalProps {
  onConfirm: (label: string) => void;
  onClose: () => void;
}

const QUICK_LABELS = ['Table 1', 'Table 2', 'Table 3', 'Livraison', 'Emporter'];

export function HoldModal({ onConfirm, onClose }: HoldModalProps) {
  const [label, setLabel] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function handleConfirm(value?: string) {
    onConfirm(value ?? label);
    onClose();
  }

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
           onClick={onClose}>
        <div
          className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-sm p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Icône + titre */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-badge-brand border border-brand-700 flex items-center justify-center">
              <Clock className="w-5 h-5 text-content-brand" />
            </div>
            <div>
              <h2 className="font-semibold text-content-primary">Mettre en attente</h2>
              <p className="text-xs text-content-secondary">Identifiez cette commande</p>
            </div>
          </div>

          {/* Saisie */}
          <input
            ref={inputRef}
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
            className="input w-full mb-3"
            placeholder="Ex : Table 4, Jean Dupont…"
            maxLength={40}
          />

          {/* Étiquettes rapides */}
          <div className="flex flex-wrap gap-2 mb-5">
            {QUICK_LABELS.map((l) => (
              <button
                key={l}
                onClick={() => handleConfirm(l)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-surface-border
                           text-content-secondary hover:border-brand-500 hover:text-content-brand transition-colors"
              >
                {l}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary flex-1">
              Annuler
            </button>
            <button
              onClick={() => handleConfirm()}
              className="btn-primary flex-1"
            >
              Mettre en attente
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

