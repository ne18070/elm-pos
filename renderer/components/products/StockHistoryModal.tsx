'use client';

import { useEffect, useState } from 'react';
import { Loader2, ArrowUp, ArrowDown, AlertTriangle, CheckCircle2, History } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { getStockMovements } from '@services/supabase/products';
import type { Product, StockMovement } from '@pos-types';

const REASON_LABEL: Record<string, string> = {
  initial:           'Stock initial',
  vente:             'Vente',
  approvisionnement: 'Approvisionnement',
  ajustement:        'Ajustement manuel',
  annulation:        'Annulation de vente',
  remboursement:     'Remboursement',
  modif_commande:    'Modification commande',
};

const REASON_CLASS: Record<string, string> = {
  vente:             'bg-badge-error text-status-error',
  approvisionnement: 'bg-badge-success text-status-success',
  annulation:        'bg-badge-warning text-status-warning',
  remboursement:     'bg-badge-warning text-status-warning',
  modif_commande:    'bg-badge-warning text-status-warning',
  ajustement:        'bg-surface-input text-content-secondary',
  initial:           'bg-badge-brand text-content-brand',
};

interface Props {
  product: Product;
  onClose: () => void;
}

export function StockHistoryModal({ product, onClose }: Props) {
  const [rows, setRows]     = useState<StockMovement[]>([]);
  const [loading, setLoad]  = useState(true);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoad(true);
    getStockMovements(product.id)
      .then((r) => { if (alive) setRows(r); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (alive) setLoad(false); });
    return () => { alive = false; };
  }, [product.id]);

  const nf = (n: number) => {
    const s = Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 3 });
    return s;
  };
  const unit = product.unit ? ` ${product.unit}` : '';

  // Cohérence : le solde du mouvement le plus récent doit = stock courant,
  // et chaque ligne : solde_précédent + delta = solde_après.
  const latest = rows[0];
  const currentStock = product.stock ?? 0;
  const headMismatch =
    latest != null && Math.abs(Number(latest.balance_after) - currentStock) > 0.001;

  const chainBreaks = new Set<string>();
  for (let i = 0; i < rows.length - 1; i++) {
    const cur  = rows[i];
    const prev = rows[i + 1]; // plus ancien
    if (Math.abs(Number(prev.balance_after) + Number(cur.delta) - Number(cur.balance_after)) > 0.001) {
      chainBreaks.add(cur.id);
    }
  }
  const coherent = !headMismatch && chainBreaks.size === 0 && !error;

  return (
    <Modal title={`Historique du stock — ${product.name}`} onClose={onClose} size="lg">
      <div className="space-y-3">
        {/* Bandeau cohérence */}
        {!loading && (
          <div className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${
            coherent
              ? 'border-status-success bg-badge-success text-status-success'
              : 'border-status-error bg-badge-error text-status-error'
          }`}>
            {coherent
              ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
            <div className="min-w-0">
              {coherent ? (
                <p>Stock cohérent : {nf(currentStock)}{unit} · {rows.length} mouvement{rows.length !== 1 ? 's' : ''}</p>
              ) : (
                <ul className="space-y-0.5">
                  {error && <li>Erreur de chargement : {error}</li>}
                  {headMismatch && (
                    <li>
                      Écart : stock fiche = <b>{nf(currentStock)}{unit}</b>, dernier mouvement = <b>{nf(Number(latest.balance_after))}{unit}</b>.
                    </li>
                  )}
                  {chainBreaks.size > 0 && (
                    <li>{chainBreaks.size} rupture{chainBreaks.size > 1 ? 's' : ''} de chaîne (solde incohérent d'une ligne à l'autre).</li>
                  )}
                </ul>
              )}
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-10 text-content-secondary">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-content-secondary gap-2">
            <History className="w-10 h-10 opacity-30" />
            <p className="text-sm">Aucun mouvement enregistré pour ce produit.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-surface-border overflow-hidden max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-card sticky top-0">
                <tr className="text-left text-xs text-content-secondary uppercase tracking-wide">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Motif</th>
                  <th className="px-3 py-2 text-right">Mouvement</th>
                  <th className="px-3 py-2 text-right">Solde après</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const up = Number(m.delta) >= 0;
                  return (
                    <tr
                      key={m.id}
                      className={`border-t border-surface-border ${chainBreaks.has(m.id) ? 'bg-badge-error' : ''}`}
                    >
                      <td className="px-3 py-2 whitespace-nowrap text-content-secondary text-xs">
                        {new Date(m.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${REASON_CLASS[m.reason] ?? 'bg-surface-input text-content-secondary'}`}>
                          {REASON_LABEL[m.reason] ?? m.reason}
                        </span>
                        {m.note && <p className="text-xs text-content-muted mt-0.5">{m.note}</p>}
                      </td>
                      <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${up ? 'text-status-success' : 'text-status-error'}`}>
                        <span className="inline-flex items-center gap-0.5 justify-end">
                          {up ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                          {nf(Math.abs(Number(m.delta)))}{unit}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-content-primary">
                        {nf(Number(m.balance_after))}{unit}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
