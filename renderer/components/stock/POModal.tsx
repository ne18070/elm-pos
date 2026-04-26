'use client';
import { toUserError } from '@/lib/user-error';

import { useState, useMemo } from 'react';
import { X, Package, Loader2, AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { useProducts } from '@/hooks/useProducts';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { formatCurrency } from '@/lib/utils';
import { createPurchaseOrder } from '@services/supabase/purchase-orders';
import type { Product } from '@pos-types';
import type { Supplier } from '@services/supabase/suppliers';

interface POLine {
  _id:        string;
  product:    Product | null;
  search:     string;
  qty:        string;
  costPerUnit: string;
}

function makeId() { return Math.random().toString(36).slice(2); }
function emptyLine(): POLine {
  return { _id: makeId(), product: null, search: '', qty: '', costPerUnit: '' };
}

// --- LineCard ----------------------------------------------------------------

function POLineCard({
  line, products, onUpdate, onRemove, canRemove, currency,
}: {
  line:      POLine;
  products:  Product[];
  onUpdate:  (patch: Partial<Omit<POLine, '_id'>>) => void;
  onRemove:  () => void;
  canRemove: boolean;
  currency?: string;
}) {
  const [showDrop, setShowDrop] = useState(false);
  const filtered = useMemo(() => {
    if (!line.search) return products.slice(0, 8);
    const q = line.search.toLowerCase();
    return products.filter(p =>
      p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [products, line.search]);

  const unit  = line.product?.unit ?? 'pièce';
  const qty   = parseFloat(line.qty) || 0;
  const total = qty * (parseFloat(line.costPerUnit) || 0);

  return (
    <div className="rounded-xl border border-surface-border bg-surface-input p-3 space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text" value={line.search}
            onChange={e => { onUpdate({ search: e.target.value, product: null }); setShowDrop(true); }}
            onFocus={() => setShowDrop(true)}
            onBlur={() => setTimeout(() => setShowDrop(false), 150)}
            placeholder="Rechercher un produit…"
            className="input w-full text-sm" autoComplete="off"
          />
          {showDrop && filtered.length > 0 && (
            <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-surface-card border border-surface-border rounded-xl overflow-hidden shadow-xl">
              {filtered.map(p => (
                <button key={p.id} type="button"
                  onMouseDown={() => { onUpdate({ product: p, search: p.name }); setShowDrop(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-hover text-left"
                >
                  <div className="w-7 h-7 rounded-lg bg-surface-input flex items-center justify-center shrink-0">
                    {p.image_url
                      ? <img src={p.image_url} alt="" className="w-full h-full object-cover rounded-lg" />
                      : <Package className="w-3.5 h-3.5 text-content-primary" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-content-primary font-medium truncate">{p.name}</p>
                    <p className="text-xs text-content-muted">Stock : {p.stock ?? 0} {p.unit ?? 'pièce'}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        {canRemove && (
          <button onClick={onRemove} className="p-2 rounded-lg text-content-secondary hover:text-status-error hover:bg-badge-error transition-colors shrink-0">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {line.product && (
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="text-[10px] text-content-muted block mb-1">Quantité commandée ({unit})</label>
            <input type="number" inputMode="decimal" value={line.qty}
              onChange={e => onUpdate({ qty: e.target.value })}
              placeholder="0" className="input text-xl font-bold text-center py-2 w-full" />
          </div>
          <div className="flex-1">
            <label className="text-[10px] text-content-muted block mb-1">
              Coût/{unit}{currency ? ` (${currency})` : ''}
            </label>
            <input type="number" inputMode="decimal" value={line.costPerUnit}
              onChange={e => onUpdate({ costPerUnit: e.target.value })}
              placeholder="0" className="input text-sm w-full" />
          </div>
          {qty > 0 && (
            <div className="shrink-0 text-right pb-0.5">
              <p className="font-black text-content-brand text-sm">{qty} {unit}</p>
              {total > 0 && <p className="text-xs text-content-secondary">{formatCurrency(total, currency)}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Modal -------------------------------------------------------------------

interface POModalProps {
  onClose:    () => void;
  onSuccess:  () => void;
  suppliers?: Supplier[];
}

export function POModal({ onClose, onSuccess, suppliers = [] }: POModalProps) {
  const { business, user }             = useAuthStore();
  const { success: notifOk, error: notifError } = useNotificationStore();
  const { products }                   = useProducts(business?.id ?? '');

  const [lines, setLines]               = useState<POLine[]>([emptyLine()]);
  const [supplierInput, setSupplierInput] = useState('');
  const [showSupDrop, setShowSupDrop]   = useState(false);
  const [reference, setReference]       = useState('');
  const [notes, setNotes]               = useState('');
  const [saving, setSaving]             = useState(false);
  const [confirming, setConfirming]     = useState(false);

  const supplierSuggestions = useMemo(() => {
    if (!supplierInput) return suppliers.slice(0, 6);
    const q = supplierInput.toLowerCase();
    return suppliers.filter(s => s.name.toLowerCase().includes(q)).slice(0, 6);
  }, [suppliers, supplierInput]);

  const selectedSupplier = suppliers.find(s => s.name === supplierInput) ?? null;

  function updateLine(id: string, patch: Partial<Omit<POLine, '_id'>>) {
    setLines(prev => prev.map(l => l._id === id ? { ...l, ...patch } : l));
  }

  const validLines = lines.filter(l => l.product && parseFloat(l.qty) > 0);
  const grandTotal = lines.reduce((s, l) => s + (parseFloat(l.qty) || 0) * (parseFloat(l.costPerUnit) || 0), 0);

  async function handleSave() {
    if (!business || !user) return;
    if (validLines.length === 0) { notifError('Aucune ligne valide'); return; }

    setSaving(true);
    try {
      await createPurchaseOrder(business.id, {
        supplier_id:   selectedSupplier?.id ?? null,
        supplier_name: supplierInput || null,
        reference:     reference || null,
        notes:         notes || null,
        created_by:    user.id,
        items: validLines.map(l => ({
          product_id:       l.product!.id,
          quantity_ordered: parseFloat(l.qty),
          cost_per_unit:    parseFloat(l.costPerUnit) || null,
        })),
      });
      notifOk(`Bon de commande créé — ${validLines.length} produit${validLines.length > 1 ? 's' : ''}`);
      onSuccess();
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-surface-card border border-surface-border rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">

        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border shrink-0">
          <h2 className="font-semibold text-content-primary text-lg">Nouveau bon de commande</h2>
          <button onClick={() => setConfirming(true)} className="text-content-secondary hover:text-content-primary">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="space-y-3">
            <p className="text-xs font-semibold text-content-secondary uppercase tracking-wider">Fournisseur</p>

            <div className="relative">
              <input type="text" value={supplierInput}
                onChange={e => { setSupplierInput(e.target.value); setShowSupDrop(true); }}
                onFocus={() => setShowSupDrop(true)}
                onBlur={() => setTimeout(() => setShowSupDrop(false), 150)}
                placeholder="Nom du fournisseur…" className="input w-full"
              />
              {showSupDrop && supplierSuggestions.length > 0 && (
                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-surface-card border border-surface-border rounded-xl overflow-hidden shadow-xl">
                  {supplierSuggestions.map(s => (
                    <button key={s.id} type="button"
                      onMouseDown={() => { setSupplierInput(s.name); setShowSupDrop(false); }}
                      className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-surface-hover text-left"
                    >
                      <span className="text-sm text-content-primary font-medium">{s.name}</span>
                      {s.phone && <span className="text-xs text-content-muted">{s.phone}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-content-secondary mb-1 block">Référence commande</label>
                <input type="text" value={reference} onChange={e => setReference(e.target.value)}
                  placeholder="BC-2025-001" className="input w-full" />
              </div>
              <div>
                <label className="text-xs text-content-secondary mb-1 block">Notes</label>
                <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Délai, conditions…" className="input w-full" />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold text-content-secondary uppercase tracking-wider">
              Articles commandés · {lines.length} ligne{lines.length > 1 ? 's' : ''}
            </p>
            {lines.map(line => (
              <POLineCard
                key={line._id} line={line} products={products}
                onUpdate={patch => updateLine(line._id, patch)}
                onRemove={() => setLines(prev => prev.filter(l => l._id !== line._id))}
                canRemove={lines.length > 1}
                currency={business?.currency}
              />
            ))}
            <button
              onClick={() => setLines(prev => [...prev, emptyLine()])}
              className="w-full py-2.5 rounded-xl border border-dashed border-surface-border text-content-secondary hover:text-content-primary hover:border-brand-500 hover:bg-badge-brand transition-colors text-sm font-medium flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" /> Ajouter un article
            </button>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-surface-border shrink-0">
          {grandTotal > 0 && (
            <p className="text-xs text-content-secondary mb-3">
              Total estimé : <strong className="text-content-primary">{formatCurrency(grandTotal, business?.currency)}</strong>
              {' · '}{validLines.length} article{validLines.length > 1 ? 's' : ''}
            </p>
          )}
          <div className="flex gap-3">
            <button onClick={() => setConfirming(true)} className="btn-secondary flex-1 h-11">Annuler</button>
            <button
              onClick={handleSave}
              disabled={saving || validLines.length === 0}
              className="btn-primary flex-1 h-11 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Création…' : 'Créer la commande'}
            </button>
          </div>
        </div>

        {confirming && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/70 backdrop-blur-sm">
            <div className="bg-surface-card border border-surface-border rounded-2xl p-6 mx-6 space-y-4 shadow-2xl">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-status-warning shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-content-primary">Annuler la saisie ?</p>
                  <p className="text-sm text-content-secondary mt-1">Les informations seront perdues.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setConfirming(false)} className="btn-secondary flex-1">Continuer</button>
                <button
                  onClick={() => { setConfirming(false); onClose(); }}
                  className="flex-1 h-10 px-4 rounded-xl bg-badge-error border border-status-error text-status-error font-medium text-sm"
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
