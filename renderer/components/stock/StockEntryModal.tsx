'use client';
import { toUserError } from '@/lib/user-error';

import { useState, useEffect, useMemo } from 'react';
import { X, Package, Calculator, Loader2, AlertTriangle } from 'lucide-react';
import { useProducts } from '@/hooks/useProducts';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { formatCurrency } from '@/lib/utils';
import { addStockEntry } from '@services/supabase/stock';
import type { Product } from '@pos-types';

interface StockEntryModalProps {
  onClose: () => void;
  onSuccess: () => void;
  preselectedProduct?: Product;
}

type Mode = 'direct' | 'packaging';

export function StockEntryModal({ onClose, onSuccess, preselectedProduct }: StockEntryModalProps) {
  const { business, user } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();
  const { products } = useProducts(business?.id ?? '');

  const [search, setSearch]               = useState(preselectedProduct?.name ?? '');
  const [selectedProduct, setSelected]    = useState<Product | null>(preselectedProduct ?? null);
  const [showDropdown, setShowDropdown]   = useState(false);
  const [mode, setMode]                   = useState<Mode>('packaging');

  // Mode direct
  const [directQty, setDirectQty]         = useState('');

  // Mode conditionnement
  const [packQty, setPackQty]             = useState('');     // nb de colis (ex: 20)
  const [packSize, setPackSize]           = useState('');     // taille par colis (ex: 50)
  const [packUnit, setPackUnit]           = useState('');     // label (ex: sac)

  // Infos achat
  const [supplier, setSupplier]           = useState('');
  const [costPerUnit, setCostPerUnit]     = useState('');
  const [notes, setNotes]                 = useState('');
  const [saving, setSaving]               = useState(false);
  const [confirming, setConfirming]       = useState(false);

  function requestClose() { setConfirming(true); }

  const filteredProducts = useMemo(() => {
    if (!search) return products.slice(0, 8);
    const q = search.toLowerCase();
    return products.filter((p) =>
      p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [products, search]);

  // Calcul automatique de la quantité totale en unité de base
  const totalQty = useMemo(() => {
    if (mode === 'direct') return parseFloat(directQty) || 0;
    const qty  = parseFloat(packQty)  || 0;
    const size = parseFloat(packSize) || 0;
    return qty * size;
  }, [mode, directQty, packQty, packSize]);

  const unit = selectedProduct?.unit ?? 'pièce';
  const currentStock = selectedProduct?.stock ?? 0;
  const newStock = currentStock + totalQty;
  const totalCost = totalQty * (parseFloat(costPerUnit) || 0);

  async function handleSave() {
    if (!selectedProduct || !business || !user) return;
    if (totalQty <= 0) { notifError('Quantité invalide'); return; }

    setSaving(true);
    try {
      await addStockEntry({
        businessId:  business.id,
        productId:   selectedProduct.id,
        quantity:    totalQty,
        packagingQty:  mode === 'packaging' ? (parseInt(packQty) || undefined)  : undefined,
        packagingSize: mode === 'packaging' ? (parseFloat(packSize) || undefined) : undefined,
        packagingUnit: mode === 'packaging' ? (packUnit || undefined)             : undefined,
        supplier:    supplier || undefined,
        costPerUnit: parseFloat(costPerUnit) || undefined,
        notes:       notes || undefined,
        createdBy:   user.id,
      });
      success(`+${totalQty} ${unit} ajouté${totalQty > 1 ? 's' : ''} pour ${selectedProduct.name}`);
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
          <h2 className="font-semibold text-white text-lg">Nouvel approvisionnement</h2>
          <button onClick={requestClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Sélection produit */}
          <div>
            <label className="label">Produit</label>
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setShowDropdown(true); setSelected(null); }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                placeholder="Rechercher un produit…"
                className="input w-full"
                autoComplete="off"
              />
              {showDropdown && filteredProducts.length > 0 && (
                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-xl">
                  {filteredProducts.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onMouseDown={() => {
                        setSelected(p);
                        setSearch(p.name);
                        setShowDropdown(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-700 text-left"
                    >
                      <div className="w-8 h-8 rounded-lg bg-surface-input flex items-center justify-center shrink-0">
                        {p.image_url
                          ? <img src={p.image_url} alt="" className="w-full h-full object-cover rounded-lg" />
                          : <Package className="w-4 h-4 text-slate-500" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-white font-medium truncate">{p.name}</p>
                        <p className="text-xs text-slate-400">
                          Stock actuel : {p.stock ?? 0} {p.unit ?? 'pièce'}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Produit sélectionné */}
            {selectedProduct && (
              <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-brand-900/20 border border-brand-800 rounded-xl text-sm">
                <Package className="w-4 h-4 text-brand-400 shrink-0" />
                <span className="text-brand-300 font-medium">{selectedProduct.name}</span>
                <span className="text-slate-500 ml-auto">
                  Stock actuel : <strong className="text-white">{currentStock} {unit}</strong>
                </span>
              </div>
            )}
          </div>

          {/* Mode de saisie */}
          <div>
            <label className="label">Mode de saisie</label>
            <div className="flex gap-2">
              <button
                onClick={() => setMode('packaging')}
                className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                  mode === 'packaging'
                    ? 'border-brand-500 bg-brand-900/30 text-brand-400'
                    : 'border-surface-border text-slate-400 hover:text-white'
                }`}
              >
                Par conditionnement
              </button>
              <button
                onClick={() => setMode('direct')}
                className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                  mode === 'direct'
                    ? 'border-brand-500 bg-brand-900/30 text-brand-400'
                    : 'border-surface-border text-slate-400 hover:text-white'
                }`}
              >
                Quantité directe
              </button>
            </div>
          </div>

          {/* Saisie quantité */}
          {mode === 'packaging' ? (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">Ex : 20 sacs × 50 kg</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Nb de colis</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={packQty}
                    onChange={(e) => setPackQty(e.target.value)}
                    placeholder="20"
                    className="input text-center font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">
                    Contenance ({unit}/colis)
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={packSize}
                    onChange={(e) => setPackSize(e.target.value)}
                    placeholder="50"
                    className="input text-center font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Type colis</label>
                  <input
                    type="text"
                    value={packUnit}
                    onChange={(e) => setPackUnit(e.target.value)}
                    placeholder="sac"
                    className="input"
                  />
                </div>
              </div>

              {/* Calcul automatique */}
              {totalQty > 0 && (
                <div className="flex items-center gap-2 p-3 bg-slate-800/60 rounded-xl text-sm">
                  <Calculator className="w-4 h-4 text-brand-400 shrink-0" />
                  <span className="text-slate-400">
                    {packQty} {packUnit || 'colis'} × {packSize} {unit} =
                  </span>
                  <span className="font-bold text-brand-400 ml-1">{totalQty} {unit}</span>
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="text-xs text-slate-400 mb-1 block">
                Quantité reçue ({unit})
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={directQty}
                onChange={(e) => setDirectQty(e.target.value)}
                placeholder="0"
                className="input text-2xl font-bold text-center py-3"
                autoFocus
              />
            </div>
          )}

          {/* Nouveau niveau de stock (preview) */}
          {selectedProduct && totalQty > 0 && (
            <div className="grid grid-cols-3 gap-3 p-3 bg-surface-input rounded-xl text-center text-sm">
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Stock actuel</p>
                <p className="font-bold text-white">{currentStock} {unit}</p>
              </div>
              <div className="flex items-center justify-center text-brand-400 font-bold text-lg">+</div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Reçu</p>
                <p className="font-bold text-brand-400">{totalQty} {unit}</p>
              </div>
              <div className="col-span-3 pt-2 border-t border-surface-border">
                <p className="text-xs text-slate-500 mb-0.5">Nouveau stock</p>
                <p className="font-bold text-green-400 text-lg">{newStock} {unit}</p>
              </div>
            </div>
          )}

          {/* Infos achat (optionnel) */}
          <div className="space-y-3">
            <p className="label">Informations achat <span className="text-slate-600 font-normal">(optionnel)</span></p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Fournisseur</label>
                <input
                  type="text"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="Nom du fournisseur"
                  className="input"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">
                  Coût / {unit}
                  {business?.currency ? ` (${business.currency})` : ''}
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={costPerUnit}
                  onChange={(e) => setCostPerUnit(e.target.value)}
                  placeholder="0"
                  className="input"
                />
              </div>
            </div>
            {totalCost > 0 && (
              <p className="text-xs text-slate-400">
                Coût total : <strong className="text-white">
                  {formatCurrency(totalCost, business?.currency)}
                </strong>
              </p>
            )}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Notes</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Référence facture, observations…"
                className="input"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-surface-border flex gap-3 shrink-0">
          <button onClick={requestClose} className="btn-secondary flex-1 h-11">Annuler</button>
          <button
            onClick={handleSave}
            disabled={saving || !selectedProduct || totalQty <= 0}
            className="btn-primary flex-1 h-11 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
        {/* Confirmation fermeture */}
        {confirming && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/70 backdrop-blur-sm">
            <div className="bg-surface-card border border-surface-border rounded-2xl p-6 mx-6 space-y-4 shadow-2xl">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-white">Annuler la saisie ?</p>
                  <p className="text-sm text-slate-400 mt-1">Les informations saisies seront perdues.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setConfirming(false)} className="btn-secondary flex-1" autoFocus>
                  Continuer la saisie
                </button>
                <button
                  onClick={() => { setConfirming(false); onClose(); }}
                  className="flex-1 h-10 px-4 rounded-xl bg-red-900/30 border border-red-800 text-red-400 hover:bg-red-900/50 transition-colors text-sm font-medium"
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
