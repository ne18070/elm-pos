import { useState, useEffect } from 'react';
import { X, Loader2, LockOpen } from 'lucide-react';

interface OpenModalProps {
  currency: string;
  onConfirm: (amount: number) => Promise<void>;
  onClose: () => void;
}

export function OpenModal({
  currency,
  onConfirm,
  onClose,
}: OpenModalProps) {
  const [amount, setAmount]   = useState('');
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try { await onConfirm(parseFloat(amount) || 0); } finally { setLoading(false); }
  }

  // Handle Escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="open-modal-title"
    >
      <div className="card p-6 w-full max-w-sm space-y-5">
        <div className="flex items-center justify-between">
          <h2 id="open-modal-title" className="font-semibold text-content-primary text-lg">Ouvrir la caisse</h2>
          <button 
            onClick={onClose} 
            className="text-content-secondary hover:text-content-primary"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div>
          <label htmlFor="opening-amount" className="label">Fond de caisse (espèces disponibles)</label>
          <input
            id="opening-amount"
            type="number" min="0" step="100" value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input text-xl font-bold text-center"
            placeholder="0" autoFocus
          />
          <p className="text-xs text-content-muted mt-1.5">
            Montant en espèces présent dans la caisse en début de session.
          </p>
        </div>
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="btn-secondary flex-1 h-11">Annuler</button>
          <button
            onClick={handleConfirm} disabled={loading}
            className="btn-primary flex-1 h-11 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            <LockOpen className="w-4 h-4" />Ouvrir
          </button>
        </div>
      </div>
    </div>
  );
}
