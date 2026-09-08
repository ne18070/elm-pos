'use client';
import { toUserError } from '@/lib/user-error';

import { useState, useMemo } from 'react';
import { X, Package, Calculator, Loader2, AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { useProducts } from '@/hooks/useProducts';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { formatCurrency } from '@/lib/utils';
import { addStockEntry } from '@services/supabase/stock';
import type { Product } from '@pos-types';
import type { Supplier } from '@services/supabase/suppliers';

// --- Types -------------------------------------------------------------------

interface LineItem {
  _id:        string;
  product:    Product | null;
  search:     string;
  mode:       'direct' | 'packaging';
  directQty:  string;
  packQty:    string;
  packSize:   string;
  packUnit:   string;
  costPerUnit: string;
}

function makeId() { return Math.random().toString(36).slice(2); }

function emptyLine(product?: Product): LineItem {
  return {
    _id: makeId(), product: product ?? null,
    search: product?.name ?? '', mode: 'packaging',
    directQty: '', packQty: '', packSize: '', packUnit: '', costPerUnit: '',
  };
}

function lineQty(line: LineItem): number {
  if (line.mode === 'direct') return parseFloat(line.directQty) || 0;
  return (parseFloat(line.packQty) || 0) * (parseFloat(line.packSize) || 0);
}

// --- LineCard ----------------------------------------------------------------

function LineCard({
  line, products, onUpdate, onRemove, canRemove, currency,
}: {
  line:      LineItem;
  products:  Product[];
  onUpdate:  (patch: Partial<Omit<LineItem, '_id'>>) => void;
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

  const unit      = line.product?.unit ?? 'pièce';
  const totalQty  = lineQty(line);
  const totalCost = totalQty * (parseFloat(line.costPerUnit) || 0);

  return (
    <div className="rounded-xl border border-surface-border bg-surface-input p-3 space-y-3">
      {/* Product picker */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={line.search}
            onChange={(e) => { onUpdate({ search: e.target.value, product: null }); setShowDrop(true); }}
            onFocus={() => setShowDrop(true)}
            onBlur={() => setTimeout(() => setShowDrop(false), 150)}
            placeholder="Rechercher un produit…"
            className="input w-full text-sm"
            autoComplete="off"
          />
          {showDrop && filtered.length > 0 && (
            <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-surface-card border border-surface-border rounded-xl overflow-hidden shadow-xl">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
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
          <button
            onClick={onRemove}
            className="p-2 rounded-lg text-content-secondary hover:text-status-error hover:bg-badge-error transition-colors shrink-0"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {line.product && (
        <>
          {/* Mode toggle */}
          <div className="flex gap-1.5">
            {(['packaging', 'direct'] as const).map(m => (
              <button
                key={m}
                onClick={() => onUpdate({ mode: m })}
                className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                  line.mode === m
                    ? 'border-brand-500 bg-badge-brand text-content-brand'
                    : 'border-surface-border text-content-secondary hover:text-content-primary'
                }`}
              >
                {m === 'packaging' ? 'Par conditionnement' : 'Quantité directe'}
              </button>
            ))}
          </div>

          {/* Qty inputs */}
          {line.mode === 'packaging' ? (
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-content-muted block mb-1">Nb colis</label>
                <input type="number" inputMode="numeric" value={line.packQty}
                  onChange={e => onUpdate({ packQty: e.target.value })}
                  placeholder="20" className="input text-center font-bold text-sm w-full" />
              </div>
              <div>
                <label className="text-[10px] text-content-muted block mb-1">{unit}/colis</label>
                <input type="number" inputMode="decimal" value={line.packSize}
                  onChange={e => onUpdate({ packSize: e.target.value })}
                  placeholder="50" className="input text-center font-bold text-sm w-full" />
              </div>
              <div>
                <label className="text-[10px] text-content-muted block mb-1">Type colis</label>
                <input type="text" value={line.packUnit}
                  onChange={e => onUpdate({ packUnit: e.target.value })}
                  placeholder="sac" className="input text-sm w-full" />
              </div>
              {totalQty > 0 && (
                <div className="col-span-3 flex items-center gap-2 p-2 bg-surface-card rounded-lg text-xs">
                  <Calculator className="w-3.5 h-3.5 text-content-brand shrink-0" />
                  <span className="text-content-secondary">
                    {line.packQty} {line.packUnit || 'colis'} × {line.packSize} {unit} =
                  </span>
                  <span className="font-bold text-content-brand ml-1">{totalQty} {unit}</span>
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="text-[10px] text-content-muted block mb-1">Quantité reçue ({unit})</label>
              <input type="number" inputMode="decimal" value={line.directQty}
                onChange={e => onUpdate({ directQty: e.target.value })}
                placeholder="0" className="input text-xl font-bold text-center py-2 w-full" />
            </div>
          )}

          {/* Cost + summary row */}
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="text-[10px] text-content-muted block mb-1">
                Coût/{unit}{currency ? ` (${currency})` : ''}
              </label>
              <input type="number" inputMode="decimal" value={line.costPerUnit}
                onChange={e => onUpdate({ costPerUnit: e.target.value })}
                placeholder="0" className="input text-sm w-full" />
            </div>
            {totalQty > 0 && (
              <div className="shrink-0 text-right pb-0.5">
                <p className="font-black text-status-success text-sm">+{totalQty} {unit}</p>
                {totalCost > 0 && (
                  <p className="text-xs text-content-secondary">{formatCurrency(totalCost, currency)}</p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// --- Modal -------------------------------------------------------------------

interface StockEntryModalProps {
  onClose:             () => void;
  onSuccess:           () => void;
  preselectedProduct?: Product;
  suppliers?:          Supplier[];
}

export function StockEntryModal({
  onClose, onSuccess, preselectedProduct, suppliers = [],
}: StockEntryModalProps) {
  const { business, user }             = useAuthStore();
  const { success: notifOk, error: notifError } = useNotificationStore();
  const { products }                   = useProducts(business?.id ?? '');

  const [lines, setLines]               = useState<LineItem[]>([emptyLine(preselectedProduct)]);
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

  function updateLine(id: string, patch: Partial<Omit<LineItem, '_id'>>) {
    setLines(prev => prev.map(l => l._id === id ? { ...l, ...patch } : l));
  }

  const validLines = lines.filter(l => l.product && lineQty(l) > 0);
  const grandTotal = lines.reduce((s, l) => s + lineQty(l) * (parseFloat(l.costPerUnit) || 0), 0);

  async function handleSave() {
    if (!business || !user) return;
    if (validLines.length === 0) { notifError('Aucune ligne valide'); return; }
    if (validLines.some(l => (parseFloat(l.costPerUnit) || 0) < 0)) {
      notifError('Le coût unitaire ne peut pas être négatif'); return;
    }

    setSaving(true);
    try {
      for (const line of validLines) {
        await addStockEntry({
          businessId:    business.id,
          productId:     line.product!.id,
          quantity:      lineQty(line),
          packagingQty:  line.mode === 'packaging' ? (parseInt(line.packQty) || undefined) : undefined,
          packagingSize: line.mode === 'packaging' ? (parseFloat(line.packSize) || undefined) : undefined,
          packagingUnit: line.mode === 'packaging' ? (line.packUnit || undefined) : undefined,
          supplier:      supplierInput || undefined,
          costPerUnit:   parseFloat(line.costPerUnit) || undefined,
          notes:         notes || (reference ? `Réf: ${reference}` : undefined),
          createdBy:     user.id,
        });
      }
      notifOk(`${validLines.length} produit${validLines.length > 1 ? 's' : ''} approvisionné${validLines.length > 1 ? 's' : ''}`);
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

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border shrink-0">
          <h2 className="font-semibold text-content-primary text-lg">Nouvel approvisionnement</h2>
          <button onClick={() => setConfirming(true)} className="text-content-secondary hover:text-content-primary">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Delivery info */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-content-secondary uppercase tracking-wider">Informations livraison</p>

            {/* Supplier autocomplete */}
            <div className="relative">
              <label className="text-xs text-content-secondary mb-1 block">Fournisseur</label>
              <input
                type="text"
                value={supplierInput}
                onChange={e => { setSupplierInput(e.target.value); setShowSupDrop(true); }}
                onFocus={() => setShowSupDrop(true)}
                onBlur={() => setTimeout(() => setShowSupDrop(false), 150)}
                placeholder="Nom du fournisseur…"
                className="input w-full"
              />
              {showSupDrop && supplierSuggestions.length > 0 && (
                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-surface-card border border-surface-border rounded-xl overflow-hidden shadow-xl">
                  {supplierSuggestions.map(s => (
                    <button
                      key={s.id}
                      type="button"
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
                <label className="text-xs text-content-secondary mb-1 block">Référence / N° facture</label>
                <input type="text" value={reference} onChange={e => setReference(e.target.value)}
                  placeholder="FAC-2025-001" className="input w-full" />
              </div>
              <div>
                <label className="text-xs text-content-secondary mb-1 block">Notes</label>
                <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Observations…" className="input w-full" />
              </div>
            </div>
          </div>

          {/* Product lines */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-content-secondary uppercase tracking-wider">
              Produits reçus · {lines.length} ligne{lines.length > 1 ? 's' : ''}
            </p>
            {lines.map(line => (
              <LineCard
                key={line._id}
                line={line}
                products={products}
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
              <Plus className="w-4 h-4" /> Ajouter un produit
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-surface-border shrink-0">
          {grandTotal > 0 && (
            <p className="text-xs text-content-secondary mb-3">
              Total livraison : <strong className="text-content-primary">{formatCurrency(grandTotal, business?.currency)}</strong>
              {' · '}{validLines.length} produit{validLines.length > 1 ? 's' : ''}
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
              {saving
                ? 'Enregistrement…'
                : `Enregistrer${validLines.length > 0 ? ` (${validLines.length})` : ''}`}
            </button>
          </div>
        </div>

        {/* Confirm close */}
        {confirming && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/70 backdrop-blur-sm">
            <div className="bg-surface-card border border-surface-border rounded-2xl p-6 mx-6 space-y-4 shadow-2xl">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-status-warning shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-content-primary">Annuler la saisie ?</p>
                  <p className="text-sm text-content-secondary mt-1">Les informations saisies seront perdues.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setConfirming(false)} className="btn-secondary flex-1" autoFocus>
                  Continuer
                </button>
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
