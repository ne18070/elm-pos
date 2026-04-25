'use client';

import { useState, useEffect, useMemo } from 'react';
import { Store, Users, X, Gift, ChevronDown, Search, Tag } from 'lucide-react';
import {
  getResellers, getResellerClients, getActiveOffersForReseller,
} from '@services/supabase/resellers';
import type { Reseller, ResellerClient, ResellerOffer } from '@services/supabase/resellers';
import { useCartStore } from '@/store/cart';
import { supabase } from '@/lib/supabase';

interface WholesaleSelectorProps {
  businessId: string;
  onClose: () => void;
  onApplied: (ctx: WholesaleContext) => void;
  onReset: () => void;
  current: WholesaleContext | null;
}

export interface WholesaleContext {
  reseller: Reseller;
  client: ResellerClient | null;
  offers: ResellerOffer[];
}

const TYPE_LABELS = { gros: 'Gros', demi_gros: 'Demi-gros', detaillant: 'Détaillant' } as const;
const TYPE_COLORS = {
  gros:       'bg-purple-500/10 text-purple-400 border-purple-500/30',
  demi_gros:  'bg-blue-500/10 text-blue-400 border-blue-500/30',
  detaillant: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
} as const;

export function WholesaleSelector({ businessId, onClose, onApplied, onReset, current }: WholesaleSelectorProps) {
  const [resellers, setResellers]       = useState<Reseller[]>([]);
  const [clients, setClients]           = useState<ResellerClient[]>([]);
  const [offers, setOffers]             = useState<ResellerOffer[]>([]);
  const [selectedReseller, setSelectedReseller] = useState<Reseller | null>(current?.reseller ?? null);
  const [selectedClient, setSelectedClient]     = useState<ResellerClient | null>(current?.client ?? null);
  const [loading, setLoading]           = useState(true);
  const [resellerSearch, setResellerSearch]     = useState('');

  const { applyPriceOverrides, resetPriceOverrides } = useCartStore();

  useEffect(() => {
    getResellers(businessId).then((r) => { setResellers(r.filter((x) => x.is_active)); setLoading(false); });
  }, [businessId]);

  useEffect(() => {
    if (!selectedReseller) { setClients([]); setOffers([]); return; }
    Promise.all([
      getResellerClients(selectedReseller.id),
      getActiveOffersForReseller(businessId, selectedReseller.id),
    ]).then(([c, o]) => { setClients(c); setOffers(o); });
  }, [selectedReseller, businessId]);

  const filteredResellers = useMemo(() => {
    const q = resellerSearch.trim().toLowerCase();
    if (!q) return resellers;
    return resellers.filter((r) =>
      r.name.toLowerCase().includes(q) || r.phone?.includes(q)
    );
  }, [resellers, resellerSearch]);

  const isDetaillant = selectedReseller?.type === 'detaillant';

  async function handleApply() {
    if (!selectedReseller) return;

    if (isDetaillant) {
      // Détaillant → reset any wholesale override, use variant/retail prices
      resetPriceOverrides();
    } else {
      // Gros / demi-gros → apply wholesale price overrides
      const { data: products } = await supabase
        .from('products')
        .select('id, wholesale_price')
        .eq('business_id', businessId)
        .not('wholesale_price', 'is', null) as unknown as {
          data: Array<{ id: string; wholesale_price: number | null }> | null;
        };

      const overrides: Record<string, number> = {};
      (products ?? []).forEach((p) => {
        if (p.wholesale_price != null) overrides[p.id] = p.wholesale_price;
      });
      applyPriceOverrides(overrides);
    }

    onApplied({ reseller: selectedReseller, client: selectedClient, offers });
  }

  function handleResellerChange(id: string) {
    const r = resellers.find((x) => x.id === id) ?? null;
    setSelectedReseller(r);
    setSelectedClient(null);
  }

  return (
    <div className="absolute inset-0 z-30 bg-black/60 flex items-end">
      <div className="w-full bg-surface-card border-t border-surface-border rounded-t-2xl shadow-2xl max-h-[85%] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border shrink-0">
          <div className="flex items-center gap-2">
            <Store className="w-5 h-5 text-status-warning" />
            <h3 className="font-semibold text-content-primary">Vente revendeur</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-content-secondary hover:text-content-primary hover:bg-surface-hover">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Sélection revendeur */}
          <div>
            <label className="label">Revendeur <span className="text-status-error">*</span></label>
            {loading ? (
              <p className="text-sm text-content-primary">Chargement…</p>
            ) : resellers.length === 0 ? (
              <p className="text-sm text-content-primary text-center py-4">Aucun revendeur actif — créez-en un dans le menu Revendeurs</p>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-secondary pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Rechercher un revendeur…"
                    value={resellerSearch}
                    onChange={(e) => setResellerSearch(e.target.value)}
                    className="input pl-9"
                  />
                </div>
                <div className="relative">
                  <select
                    className="input appearance-none pr-8"
                    value={selectedReseller?.id ?? ''}
                    onChange={(e) => handleResellerChange(e.target.value)}
                  >
                    <option value="">— Choisir un revendeur —</option>
                    {filteredResellers.map((r) => (
                      <option key={r.id} value={r.id}>
                        [{TYPE_LABELS[r.type ?? 'gros']}] {r.name}{r.zone ? ` · ${r.zone}` : ''}{r.phone ? ` · ${r.phone}` : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-secondary pointer-events-none" />
                </div>
                {resellerSearch && filteredResellers.length === 0 && (
                  <p className="text-xs text-content-primary text-center py-1">Aucun revendeur trouvé</p>
                )}
              </div>
            )}
          </div>

          {/* Badge type + info prix */}
          {selectedReseller && (
            <div className={`flex items-center gap-3 p-3 rounded-xl border ${TYPE_COLORS[selectedReseller.type ?? 'gros']}`}>
              <Tag className="w-4 h-4 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">
                  {TYPE_LABELS[selectedReseller.type ?? 'gros']}
                  {selectedReseller.zone ? ` · Zone ${selectedReseller.zone}` : ''}
                </p>
                <p className="text-xs opacity-75 mt-0.5">
                  {isDetaillant
                    ? 'Prix détaillant appliqué — les prix de gros sont désactivés'
                    : 'Prix grossiste appliqué — remplace les prix affichés'}
                </p>
              </div>
            </div>
          )}

          {/* Sélection client du revendeur */}
          {selectedReseller && (
            <div>
              <label className="label flex items-center gap-2">
                <Users className="w-3.5 h-3.5" /> Client <span className="text-content-primary font-normal">(optionnel)</span>
              </label>
              {clients.length === 0 ? (
                <p className="text-xs text-content-primary">Aucun client enregistré pour ce revendeur</p>
              ) : (
                <div className="relative">
                  <select
                    className="input appearance-none pr-8"
                    value={selectedClient?.id ?? ''}
                    onChange={(e) => setSelectedClient(clients.find((c) => c.id === e.target.value) ?? null)}
                  >
                    <option value="">— Sans client spécifique —</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-secondary pointer-events-none" />
                </div>
              )}
            </div>
          )}

          {/* Offres volume actives */}
          {offers.length > 0 && (
            <div>
              <label className="label flex items-center gap-2">
                <Gift className="w-3.5 h-3.5 text-status-warning" /> Offres volume actives
              </label>
              <div className="space-y-2">
                {offers.map((o) => (
                  <div key={o.id} className="flex items-center gap-3 p-3 rounded-xl bg-badge-warning border border-status-warning/50 text-sm">
                    <Gift className="w-4 h-4 text-status-warning shrink-0" />
                    <span className="text-content-primary">
                      {o.label || `${o.product_name} : pour ${o.min_qty} — ${o.bonus_qty} offert${o.bonus_qty > 1 ? 's' : ''}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 py-4 border-t border-surface-border flex gap-3 shrink-0">
          {current && (
            <button
              onClick={() => { onReset(); onClose(); }}
              className="btn-secondary flex-1 h-11 text-sm"
            >
              Retour tarif normal
            </button>
          )}
          <button
            onClick={handleApply}
            disabled={!selectedReseller}
            className={`flex-1 h-11 flex items-center justify-center gap-2 btn-primary ${
              isDetaillant
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-amber-700 hover:bg-amber-800'
            }`}
          >
            <Store className="w-4 h-4" />
            {isDetaillant ? 'Appliquer prix détaillant' : 'Appliquer prix de gros'}
          </button>
        </div>
      </div>
    </div>
  );
}
