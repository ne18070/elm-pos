'use client';

import { useState, useEffect, useMemo } from 'react';
import { Store, Users, X, Gift, Search, Check, Phone, MapPin, Crown } from 'lucide-react';
import {
  getResellers, getResellerClients, getActiveOffersForReseller,
} from '@services/supabase/resellers';
import type { Reseller, ResellerClient, ResellerOffer, ResellerType } from '@services/supabase/resellers';
import { useCartStore } from '@/store/cart';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

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

const TYPES: { key: ResellerType | 'all'; label: string }[] = [
  { key: 'all',       label: 'Tous'       },
  { key: 'gros',      label: 'Gros'       },
  { key: 'demi_gros', label: 'Demi-gros'  },
  { key: 'detaillant',label: 'Détaillant' },
];

const TYPE_STYLES: Record<ResellerType, { pill: string; card: string; dot: string }> = {
  gros:       { pill: 'bg-purple-500/15 text-purple-300 border-purple-500/40', card: 'border-purple-500/50 bg-purple-500/5',  dot: 'bg-purple-400' },
  demi_gros:  { pill: 'bg-blue-500/15   text-blue-300   border-blue-500/40',   card: 'border-blue-500/50   bg-blue-500/5',    dot: 'bg-blue-400'   },
  detaillant: { pill: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40', card: 'border-emerald-500/50 bg-emerald-500/5', dot: 'bg-emerald-400' },
};

const TYPE_LABELS: Record<ResellerType, string> = { gros: 'Gros', demi_gros: 'Demi-gros', detaillant: 'Détaillant' };

export function WholesaleSelector({ businessId, onClose, onApplied, onReset, current }: WholesaleSelectorProps) {
  const [resellers, setResellers]             = useState<Reseller[]>([]);
  const [clients, setClients]                 = useState<ResellerClient[]>([]);
  const [offers, setOffers]                   = useState<ResellerOffer[]>([]);
  const [selectedReseller, setSelectedReseller] = useState<Reseller | null>(current?.reseller ?? null);
  const [selectedClient, setSelectedClient]   = useState<ResellerClient | null>(current?.client ?? null);
  const [loading, setLoading]                 = useState(true);
  const [search, setSearch]                   = useState('');
  const [typeFilter, setTypeFilter]           = useState<ResellerType | 'all'>('all');
  const [applying, setApplying]               = useState(false);
  const [clientSearch, setClientSearch]       = useState('');

  const { applyPriceOverrides, resetPriceOverrides } = useCartStore();

  useEffect(() => {
    getResellers(businessId).then((r) => { setResellers(r.filter((x) => x.is_active)); setLoading(false); });
  }, [businessId]);

  useEffect(() => {
    if (!selectedReseller) { setClients([]); setOffers([]); return; }
    Promise.all([
      getResellerClients(selectedReseller.id),
      getActiveOffersForReseller(businessId, selectedReseller.id),
    ]).then(([c, o]) => { setClients(c); setOffers(o); setClientSearch(''); });
  }, [selectedReseller, businessId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return resellers.filter((r) => {
      const matchType = typeFilter === 'all' || r.type === typeFilter;
      const matchSearch = !q || r.name.toLowerCase().includes(q) || r.phone?.includes(q) || r.zone?.toLowerCase().includes(q);
      return matchType && matchSearch;
    });
  }, [resellers, search, typeFilter]);

  // Group filtered resellers by zone for display
  const zones = useMemo(() => {
    const map = new Map<string, Reseller[]>();
    filtered.forEach((r) => {
      const z = r.zone || '';
      if (!map.has(z)) map.set(z, []);
      map.get(z)!.push(r);
    });
    return map;
  }, [filtered]);

  const isDetaillant = selectedReseller?.type === 'detaillant';

  function selectReseller(r: Reseller) {
    if (selectedReseller?.id === r.id) {
      setSelectedReseller(null);
      setSelectedClient(null);
    } else {
      setSelectedReseller(r);
      setSelectedClient(null);
    }
  }

  async function handleApply() {
    if (!selectedReseller) return;
    setApplying(true);
    try {
      if (isDetaillant) {
        resetPriceOverrides();
      } else {
        const { data: products } = await supabase
          .from('products')
          .select('id, wholesale_price')
          .eq('business_id', businessId)
          .not('wholesale_price', 'is', null) as unknown as {
            data: Array<{ id: string; wholesale_price: number | null }> | null;
          };
        const overrides: Record<string, number> = {};
        (products ?? []).forEach((p) => { if (p.wholesale_price != null) overrides[p.id] = p.wholesale_price; });
        applyPriceOverrides(overrides);
      }
      onApplied({ reseller: selectedReseller, client: selectedClient, offers });
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="absolute inset-0 z-30 bg-black/60 flex items-end">
      <div className="w-full bg-surface-card border-t border-surface-border rounded-t-2xl shadow-2xl max-h-[90%] flex flex-col">

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

        {/* Type tabs */}
        <div className="px-4 pt-3 pb-2 flex gap-2 shrink-0 border-b border-surface-border/50">
          {TYPES.map(({ key, label }) => {
            const active = typeFilter === key;
            const style  = key !== 'all' ? TYPE_STYLES[key as ResellerType] : null;
            const count  = key === 'all' ? resellers.length : resellers.filter((r) => r.type === key).length;
            return (
              <button
                key={key}
                onClick={() => setTypeFilter(key)}
                className={cn(
                  'flex-1 py-2 px-2 rounded-xl text-xs font-semibold border transition-all',
                  active
                    ? (style ? style.pill : 'bg-brand-500/10 text-content-brand border-brand-500/40')
                    : 'border-surface-border text-content-muted hover:text-content-primary hover:border-surface-hover'
                )}
              >
                {label}
                <span className={cn('ml-1 text-[10px] opacity-60', active && 'opacity-100')}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="px-4 py-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted pointer-events-none" />
            <input
              type="text"
              placeholder="Nom, téléphone, zone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-9 h-9 text-sm"
            />
          </div>
        </div>

        {/* Reseller list */}
        <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-3">
          {loading && (
            <p className="text-center text-content-muted text-sm py-8">Chargement…</p>
          )}

          {!loading && filtered.length === 0 && (
            <p className="text-center text-content-muted text-sm py-8">Aucun revendeur trouvé</p>
          )}

          {!loading && [...zones.entries()].map(([zone, items]) => (
            <div key={zone || '_'}>
              {zone && (
                <div className="flex items-center gap-2 mb-1.5">
                  <MapPin className="w-3 h-3 text-content-muted shrink-0" />
                  <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider">{zone}</span>
                  <div className="flex-1 h-px bg-surface-border" />
                </div>
              )}
              <div className="space-y-1.5">
                {items.map((r) => {
                  const selected = selectedReseller?.id === r.id;
                  const style    = TYPE_STYLES[r.type ?? 'gros'];
                  const chef     = r.chef_id ? resellers.find((x) => x.id === r.chef_id) : null;
                  return (
                    <button
                      key={r.id}
                      onClick={() => selectReseller(r)}
                      className={cn(
                        'w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left',
                        selected ? style.card + ' ring-1 ring-inset ring-current' : 'border-surface-border hover:border-surface-hover hover:bg-surface-hover'
                      )}
                    >
                      {/* Avatar */}
                      <div className={cn(
                        'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold',
                        selected ? style.card : 'bg-surface-input text-content-primary'
                      )}>
                        {r.name.charAt(0).toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-content-primary truncate">{r.name}</p>
                          {chef && <Crown className="w-3 h-3 text-yellow-500 shrink-0" />}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded border', style.pill)}>
                            {TYPE_LABELS[r.type ?? 'gros']}
                          </span>
                          {r.phone && (
                            <span className="flex items-center gap-0.5 text-[10px] text-content-muted">
                              <Phone className="w-2.5 h-2.5" />{r.phone}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Check */}
                      <div className={cn(
                        'w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
                        selected ? 'bg-brand-500 border-brand-500' : 'border-surface-border'
                      )}>
                        {selected && <Check className="w-3.5 h-3.5 text-white" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Selected reseller summary + client chips */}
        {selectedReseller && (
          <div className="px-4 py-3 border-t border-surface-border/50 bg-surface-hover/30 space-y-3 shrink-0">
            {/* Price mode info */}
            <div className={cn('flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-xl border', TYPE_STYLES[selectedReseller.type ?? 'gros'].pill)}>
              <div className={cn('w-2 h-2 rounded-full', TYPE_STYLES[selectedReseller.type ?? 'gros'].dot)} />
              <span className="font-bold">{selectedReseller.name}</span>
              <span className="opacity-70">—</span>
              <span className="opacity-70">
                {isDetaillant ? 'Prix détaillant (tarif normal)' : 'Prix de gros appliqué'}
              </span>
            </div>

            {/* Client list */}
            {clients.length > 0 && (
              <div>
                <p className="text-[10px] text-content-muted font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Users className="w-3 h-3" /> Client <span className="opacity-60 font-normal normal-case">(optionnel — {clients.length})</span>
                </p>

                {clients.length > 5 && (
                  <div className="relative mb-2">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-muted pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Rechercher un client…"
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      className="input pl-8 h-8 text-xs"
                    />
                  </div>
                )}

                <div className="max-h-36 overflow-y-auto space-y-1 custom-scrollbar">
                  {/* "No client" row */}
                  <button
                    onClick={() => setSelectedClient(null)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-all',
                      !selectedClient
                        ? 'bg-brand-500/10 border-brand-500/40 text-content-brand font-semibold'
                        : 'border-transparent text-content-muted hover:bg-surface-hover'
                    )}
                  >
                    <div className={cn('w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all', !selectedClient ? 'bg-brand-500 border-brand-500' : 'border-surface-border')}>
                      {!selectedClient && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span>Sans client spécifique</span>
                  </button>

                  {clients
                    .filter((c) => {
                      const q = clientSearch.trim().toLowerCase();
                      return !q || c.name.toLowerCase().includes(q) || c.phone?.includes(q);
                    })
                    .map((c) => {
                      const active = selectedClient?.id === c.id;
                      return (
                        <button
                          key={c.id}
                          onClick={() => setSelectedClient(active ? null : c)}
                          className={cn(
                            'w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-all',
                            active
                              ? 'bg-brand-500/10 border-brand-500/40 text-content-brand font-semibold'
                              : 'border-transparent text-content-primary hover:bg-surface-hover'
                          )}
                        >
                          <div className={cn('w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all', active ? 'bg-brand-500 border-brand-500' : 'border-surface-border')}>
                            {active && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0 text-left">
                            <span className="truncate block">{c.name}</span>
                            {c.phone && <span className="text-content-muted font-normal">{c.phone}</span>}
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Volume offers */}
            {offers.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {offers.map((o) => (
                  <div key={o.id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-badge-warning border border-status-warning/40 text-[10px] text-status-warning font-medium">
                    <Gift className="w-3 h-3 shrink-0" />
                    {o.label || `${o.product_name} : ${o.min_qty} → ${o.bonus_qty} offert`}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="px-4 py-3 border-t border-surface-border flex gap-2 shrink-0">
          {current && (
            <button onClick={() => { onReset(); onClose(); }} className="btn-secondary h-11 px-4 text-sm shrink-0">
              Annuler
            </button>
          )}
          <button
            onClick={handleApply}
            disabled={!selectedReseller || applying}
            className={cn(
              'flex-1 h-11 flex items-center justify-center gap-2 font-semibold rounded-xl transition-all text-sm text-white disabled:opacity-40',
              isDetaillant ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-700 hover:bg-amber-800'
            )}
          >
            {applying ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            {!selectedReseller
              ? 'Sélectionner un revendeur'
              : isDetaillant
                ? `Confirmer — Prix détaillant`
                : `Confirmer — Prix de gros`}
          </button>
        </div>
      </div>
    </div>
  );
}
