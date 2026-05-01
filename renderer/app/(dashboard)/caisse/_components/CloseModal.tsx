import { useState, useEffect } from 'react';
import { X, Loader2, Lock, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { CashSession, SessionLiveSummary } from '@services/supabase/cash-sessions';

interface CloseModalProps {
  session: CashSession;
  summary: SessionLiveSummary;
  currency: string;
  onConfirm: (actualCash: number, notes: string) => Promise<void>;
  onClose: () => void;
}

export function CloseModal({
  session, summary, currency, onConfirm, onClose,
}: CloseModalProps) {
  const [actualCash, setActualCash] = useState('');
  const [notes, setNotes]           = useState('');
  const [loading, setLoading]       = useState(false);

  const fmt          = (n: number) => formatCurrency(n, currency);
  // Point 8: Expected cash should subtract refunds
  const expectedCash = session.opening_amount + summary.total_cash - summary.total_refunds;
  const actualNum    = parseFloat(actualCash) || 0;
  const difference   = actualNum - expectedCash;
  const hasDifference = Math.abs(difference) >= 1;

  async function handleConfirm() {
    setLoading(true);
    try { await onConfirm(actualNum, notes); } finally { setLoading(false); }
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
      aria-labelledby="close-modal-title"
    >
      <div className="card p-6 w-full max-w-md space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 id="close-modal-title" className="font-semibold text-content-primary text-lg">Clôturer la caisse</h2>
          <button 
            onClick={onClose} 
            className="text-content-secondary hover:text-content-primary"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-surface-input rounded-xl p-4 space-y-2 text-sm">
          <p className="text-xs text-content-muted uppercase tracking-wider font-medium mb-3">Résumé de la session</p>
          <div className="flex justify-between"><span className="text-content-secondary">Fond de caisse</span><span className="text-content-primary font-medium">{fmt(session.opening_amount)}</span></div>
          <div className="flex justify-between"><span className="text-content-secondary">Ventes espèces</span><span className="text-status-success font-medium">+{fmt(summary.total_cash)}</span></div>
          {summary.total_card > 0 && <div className="flex justify-between"><span className="text-content-secondary">Ventes carte</span><span className="text-content-primary">{fmt(summary.total_card)}</span></div>}
          {summary.total_mobile > 0 && <div className="flex justify-between"><span className="text-content-secondary">Ventes mobile money</span><span className="text-content-primary">{fmt(summary.total_mobile)}</span></div>}
          {summary.total_refunds > 0 && <div className="flex justify-between"><span className="text-content-secondary">Remboursements (Espèces)</span><span className="text-status-error">-{fmt(summary.total_refunds)}</span></div>}
          <div className="flex justify-between font-bold border-t border-surface-border pt-2 mt-1"><span className="text-content-primary">Total ventes</span><span className="text-content-brand">{fmt(summary.total_sales)}</span></div>
          <div className="flex justify-between font-semibold"><span className="text-content-primary">Espèces attendues en caisse</span><span className="text-content-primary">{fmt(expectedCash)}</span></div>
        </div>

        <div>
          <label htmlFor="actual-cash" className="label">Espèces comptées (montant réel en caisse)</label>
          <input
            id="actual-cash"
            type="number" min="0" step="100" value={actualCash}
            onChange={(e) => setActualCash(e.target.value)}
            className="input text-xl font-bold text-center"
            placeholder={fmt(expectedCash)} autoFocus
          />
        </div>

        {actualCash && (
          <div className={`rounded-xl p-4 border text-center ${
            Math.abs(difference) < 1 ? 'bg-badge-success border-status-success'
              : difference > 0       ? 'bg-badge-info border-blue-700'
                                     : 'bg-badge-error border-status-error'
          }`}>
            <p className="text-xs text-content-secondary mb-1">Écart</p>
            <p className={`text-2xl font-bold ${
              Math.abs(difference) < 1 ? 'text-status-success' : difference > 0 ? 'text-status-info' : 'text-status-error'
            }`}>
              {difference >= 0 ? '+' : ''}{fmt(difference)}
            </p>
            <p className="text-xs text-content-muted mt-1">
              {Math.abs(difference) < 1 ? 'Caisse équilibrée' : difference > 0 ? 'Excédent de caisse' : 'Déficit de caisse'}
            </p>
          </div>
        )}

        {hasDifference && (
          <div className="bg-status-error/10 border border-status-error/20 rounded-lg p-3 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-status-error shrink-0 mt-0.5" />
            <p className="text-xs text-status-error leading-relaxed">
              <strong>Un écart de caisse a été détecté.</strong> Veuillez expliquer la raison (erreur de rendu, billet abîmé, etc.) dans les notes ci-dessous avant de clôturer.
            </p>
          </div>
        )}

        <div>
          <label htmlFor="notes" className="label">Notes {hasDifference && <span className="text-status-error">*</span>}</label>
          <textarea
            id="notes"
            value={notes} onChange={(e) => setNotes(e.target.value)}
            className="input resize-none h-16" 
            placeholder={hasDifference ? "Expliquez l'écart ici..." : "Ex : RAS, tout est OK…"}
            required={hasDifference}
          />
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="btn-secondary flex-1 h-11">Annuler</button>
          <button
            onClick={handleConfirm} 
            disabled={loading || !actualCash || (hasDifference && !notes.trim())}
            className="btn-danger flex-1 h-11 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            <Lock className="w-4 h-4" />Clôturer
          </button>
        </div>
      </div>
    </div>
  );
}
