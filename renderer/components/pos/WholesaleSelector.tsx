'use client';

import { useState, useEffect, useMemo } from 'react';
import { Store, Users, X, Gift, ChevronDown, Search } from 'lucide-react';
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

export function WholesaleSelector({ businessId, onClose, onApplied, onReset, current }: WholesaleSelectorProps) {
  const [resellers, setResellers]       = useState<Reseller[]>([]);
  const [clients, setClients]           = useState<ResellerClient[]>([]);
  const [offers, setOffers]             = useState<ResellerOffer[]>([]);
  const [selectedReseller, setSelectedReseller] = useState<Reseller | null>(current?.reseller ?? null);
  const [selectedClient, setSelectedClient]     = useState<ResellerClient | null>(current?.client ?? null);
  const [loading, setLoading]           = useState(true);
  const [resellerSearch, setResellerSearch]     = useState('');

  const { applyPriceOverrides } = useCartStore();

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

  async function handleApply() {
    if (!selectedReseller) return;

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
            <h3 className="font-semibold text-white">Mode Grossiste</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-content-secondary hover:text-white hover:bg-surface-hover">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Sélection revendeur */}
          <div>
            <label className="label">Revendeur <span className="text-status-error">*</span></label>
            {loading ? (
              <p className="text-sm text-slate-500">Chargement…</p>
            ) : resellers.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">Aucun revendeur actif — créez-en un dans le menu Revendeurs</p>
            ) : (
              <div className="space-y-2">
                {/* Barre de recherche */}
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
                {/* Select dropdown */}
                <div className="relative">
                  <select
                    className="input appearance-none pr-8"
                    value={selectedReseller?.id ?? ''}
                    onChange={(e) => handleResellerChange(e.target.value)}
                  >
                    <option value="">— Choisir un revendeur —</option>
                    {filteredResellers.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}{r.phone ? ` · ${r.phone}` : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-secondary pointer-events-none" />
                </div>
                {resellerSearch && filteredResellers.length === 0 && (
                  <p className="text-xs text-slate-500 text-center py-1">Aucun revendeur trouvé</p>
                )}
              </div>
            )}
          </div>

          {/* Sélection client du revendeur */}
          {selectedReseller && (
            <div>
              <label className="label flex items-center gap-2">
                <Users className="w-3.5 h-3.5" /> Client <span className="text-slate-500 font-normal">(optionnel)</span>
              </label>
              {clients.length === 0 ? (
                <p className="text-xs text-slate-500">Aucun client enregistré pour ce revendeur</p>
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
                      {o.label || `${o.product_name} : pour ${o.min_qty} → ${o.bonus_qty} offert${o.bonus_qty > 1 ? 's' : ''}`}
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
            className="btn-primary flex-1 h-11 flex items-center justify-center gap-2"
            style={{ background: selectedReseller ? 'rgb(180 83 9)' : undefined }}
          >
            <Store className="w-4 h-4" /> Appliquer prix de gros
          </button>
        </div>
      </div>
    </div>
  );
}
