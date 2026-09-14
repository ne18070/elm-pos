'use client';
import { toUserError } from '@/lib/user-error';

import { useState } from 'react';
import { X, Package, Loader2, Lock } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { displayCurrency } from '@/lib/utils';
import { updateStockEntry } from '@services/supabase/stock';
import type { StockEntry } from '@services/supabase/stock';

interface EditStockEntryModalProps {
  entry:     StockEntry;
  onClose:   () => void;
  onSuccess: () => void;
  currency?: string;
}

export function EditStockEntryModal({ entry, onClose, onSuccess, currency }: EditStockEntryModalProps) {
  const { user }                                = useAuthStore();
  const { success: notifOk, error: notifError } = useNotificationStore();

  const [mode, setMode]           = useState<'direct' | 'packaging'>(
    entry.packaging_qty && entry.packaging_size ? 'packaging' : 'direct'
  );
  const [directQty, setDirectQty] = useState(String(entry.quantity));
  const [packQty, setPackQty]     = useState(entry.packaging_qty  != null ? String(entry.packaging_qty)  : '');
  const [packSize, setPackSize]   = useState(entry.packaging_size != null ? String(entry.packaging_size) : '');
  const [packUnit, setPackUnit]   = useState(entry.packaging_unit ?? '');
  const [costPerUnit, setCost]    = useState(entry.cost_per_unit  != null ? String(entry.cost_per_unit)  : '');
  const [supplier, setSupplier]   = useState(entry.supplier ?? '');
  const [notes, setNotes]         = useState(entry.notes ?? '');
  const [saving, setSaving]       = useState(false);

  const unit = entry.product?.unit ?? 'pièce';
  const totalQty = mode === 'direct'
    ? (parseFloat(directQty) || 0)
    : (parseFloat(packQty) || 0) * (parseFloat(packSize) || 0);

  // Passé 24h, la quantité est figée côté serveur (déjà potentiellement
  // vendue/comptée) — on verrouille aussi les champs côté client pour éviter
  // un rejet surprise de la RPC après saisie.
  const qtyLocked = Date.now() - new Date(entry.created_at).getTime() > 24 * 60 * 60 * 1000;
  const finalQty  = qtyLocked ? entry.quantity : totalQty;

  async function handleSave() {
    if (!entry.business_id) return;
    if (finalQty <= 0) { notifError('La quantité doit être strictement positive'); return; }
    const cost = parseFloat(costPerUnit);
    if (costPerUnit.trim() !== '' && cost < 0) { notifError('Le coût unitaire ne peut pas être négatif'); return; }

    setSaving(true);
    try {
      await updateStockEntry(entry.id, entry.business_id, {
        quantity:      finalQty,
        packagingQty:  mode === 'packaging' ? (parseInt(packQty) || undefined) : undefined,
        packagingSize: mode === 'packaging' ? (parseFloat(packSize) || undefined) : undefined,
        packagingUnit: mode === 'packaging' ? (packUnit || undefined) : undefined,
        supplier:      supplier || undefined,
        costPerUnit:   costPerUnit.trim() !== '' ? cost : undefined,
        notes:         notes || undefined,
      }, user?.id);
      notifOk('Entrée de stock modifiée');
      onSuccess();
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface-card border border-surface-border rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-surface-input flex items-center justify-center shrink-0">
              <Package className="w-4 h-4 text-content-brand" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-content-primary text-sm truncate">Modifier l'entrée</h2>
              <p className="text-xs text-content-muted truncate">{entry.product?.name ?? '—'}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-content-secondary hover:text-content-primary shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {qtyLocked && (
            <div className="flex items-start gap-2 p-2.5 rounded-xl border border-surface-border bg-surface-input text-xs text-content-secondary">
              <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>Quantité verrouillée — plus de 24h depuis la saisie. Coût, fournisseur et notes restent modifiables.</span>
            </div>
          )}

          {/* Mode toggle */}
          <div className="flex gap-1.5">
            {(['packaging', 'direct'] as const).map(m => (
              <button
                key={m}
                onClick={() => !qtyLocked && setMode(m)}
                disabled={qtyLocked}
                className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                  mode === m
                    ? 'border-brand-500 bg-badge-brand text-content-brand'
                    : 'border-surface-border text-content-secondary hover:text-content-primary'
                } ${qtyLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {m === 'packaging' ? 'Par conditionnement' : 'Quantité directe'}
              </button>
            ))}
          </div>

          {mode === 'packaging' ? (
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-content-muted block mb-1">Nb colis</label>
                <input type="number" inputMode="numeric" value={packQty} disabled={qtyLocked}
                  onChange={e => setPackQty(e.target.value)}
                  placeholder="20" className="input text-center font-bold text-sm w-full disabled:opacity-50" />
              </div>
              <div>
                <label className="text-[10px] text-content-muted block mb-1">{unit}/colis</label>
                <input type="number" inputMode="decimal" value={packSize} disabled={qtyLocked}
                  onChange={e => setPackSize(e.target.value)}
                  placeholder="50" className="input text-center font-bold text-sm w-full disabled:opacity-50" />
              </div>
              <div>
                <label className="text-[10px] text-content-muted block mb-1">Type colis</label>
                <input type="text" value={packUnit}
                  onChange={e => setPackUnit(e.target.value)}
                  placeholder="sac" className="input text-sm w-full" />
              </div>
              {totalQty > 0 && (
                <div className="col-span-3 p-2 bg-surface-input rounded-lg text-xs text-content-secondary">
                  = <span className="font-bold text-content-brand">{totalQty} {unit}</span>
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="text-[10px] text-content-muted block mb-1">Quantité reçue ({unit})</label>
              <input type="number" inputMode="decimal" value={directQty} disabled={qtyLocked}
                onChange={e => setDirectQty(e.target.value)}
                placeholder="0" className="input text-xl font-bold text-center py-2 w-full disabled:opacity-50" />
            </div>
          )}

          <div>
            <label className="text-xs text-content-secondary mb-1 block">
              Prix d'achat / {unit}{currency ? ` (${displayCurrency(currency)})` : ''}
            </label>
            <input type="number" inputMode="decimal" value={costPerUnit}
              onChange={e => setCost(e.target.value)}
              placeholder="0" className="input w-full" />
          </div>

          <div>
            <label className="text-xs text-content-secondary mb-1 block">Fournisseur</label>
            <input type="text" value={supplier} onChange={e => setSupplier(e.target.value)}
              placeholder="Nom du fournisseur…" className="input w-full" />
          </div>

          <div>
            <label className="text-xs text-content-secondary mb-1 block">Notes</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Observations…" className="input w-full" />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-surface-border shrink-0 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 h-11">Annuler</button>
          <button
            onClick={handleSave}
            disabled={saving || finalQty <= 0}
            className="btn-primary flex-1 h-11 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}
