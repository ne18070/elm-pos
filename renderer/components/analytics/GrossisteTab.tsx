'use client';

import { useState, useEffect, useMemo } from 'react';
import { Store, Users, Package, Search, ChevronDown, ChevronRight, X } from 'lucide-react';
import { getResellerDetailStats } from '@services/supabase/analytics';
import type { WholesaleOrderItem } from '@services/supabase/analytics';

interface Props {
  businessId: string;
  days: number;
  fmt: (n: number) => string;
}

interface ResellerGroup {
  reseller_id: string;
  name: string;
  revenue: number;
  order_ids: Set<string>;
  clients: Map<string, string>;
  products: Map<string, { name: string; quantity: number; revenue: number }>;
}

export function GrossisteTab({ businessId, days, fmt }: Props) {
  const [items, setItems]     = useState<WholesaleOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [resellerSearch, setResellerSearch] = useState('');
  const [clientFilter, setClientFilter]     = useState('');
  const [productSearch, setProductSearch]   = useState('');

  useEffect(() => {
    setLoading(true);
    getResellerDetailStats(businessId, days)
      .then(setItems)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [businessId, days]);

  /* All unique clients for the select */
  const allClients = useMemo(() => {
    const map = new Map<string, string>();
    items.forEach((i) => { if (i.client_id && i.client_name) map.set(i.client_id, i.client_name); });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  /* Apply filters */
  const filtered = useMemo(() => items.filter((i) => {
    if (resellerSearch && !i.reseller_name.toLowerCase().includes(resellerSearch.toLowerCase())) return false;
    if (clientFilter && i.client_id !== clientFilter) return false;
    if (productSearch && !i.product_name.toLowerCase().includes(productSearch.toLowerCase())) return false;
    return true;
  }), [items, resellerSearch, clientFilter, productSearch]);

  /* Group by reseller */
  const resellerGroups = useMemo(() => {
    const map = new Map<string, ResellerGroup>();
    for (const item of filtered) {
      const g = map.get(item.reseller_id) ?? {
        reseller_id: item.reseller_id,
        name:        item.reseller_name,
        revenue:     0,
        order_ids:   new Set<string>(),
        clients:     new Map<string, string>(),
        products:    new Map<string, { name: string; quantity: number; revenue: number }>(),
      };
      g.revenue += item.revenue;
      g.order_ids.add(item.order_id);
      if (item.client_id && item.client_name) g.clients.set(item.client_id, item.client_name);
      const prod = g.products.get(item.product_id) ?? { name: item.product_name, quantity: 0, revenue: 0 };
      prod.quantity += item.quantity;
      prod.revenue  += item.revenue;
      g.products.set(item.product_id, prod);
      map.set(item.reseller_id, g);
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [filtered]);

  const totalCA    = resellerGroups.reduce((s, r) => s + r.revenue, 0);
  const totalOrders = new Set(filtered.map((i) => i.order_id)).size;
  const totalClients = new Set(filtered.filter((i) => i.client_id).map((i) => i.client_id!)).size;

  const hasFilter = resellerSearch || clientFilter || productSearch;

  return (
    <>
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4 text-center">
          <p className="text-xs text-slate-400 mb-1">CA Grossiste</p>
          <p className="text-lg font-bold text-amber-400">{loading ? '…' : fmt(totalCA)}</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xs text-slate-400 mb-1">Revendeurs</p>
          <p className="text-lg font-bold text-white">{loading ? '…' : resellerGroups.length}</p>
          <p className="text-xs text-slate-500">{loading ? '' : `${totalOrders} cmd`}</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xs text-slate-400 mb-1">Clients</p>
          <p className="text-lg font-bold text-sky-400">{loading ? '…' : totalClients}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Rechercher un revendeur…"
            value={resellerSearch}
            onChange={(e) => { setResellerSearch(e.target.value); setExpanded(null); }}
            className="input pl-9"
          />
          {resellerSearch && (
            <button onClick={() => setResellerSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Client filter */}
          <div className="relative">
            <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <select
              className="input pl-9 appearance-none pr-7"
              value={clientFilter}
              onChange={(e) => { setClientFilter(e.target.value); setExpanded(null); }}
            >
              <option value="">Tous les clients</option>
              {allClients.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>

          {/* Product filter */}
          <div className="relative">
            <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Produit…"
              value={productSearch}
              onChange={(e) => { setProductSearch(e.target.value); setExpanded(null); }}
              className="input pl-9"
            />
            {productSearch && (
              <button onClick={() => setProductSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {hasFilter && (
          <button
            onClick={() => { setResellerSearch(''); setClientFilter(''); setProductSearch(''); }}
            className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Effacer tous les filtres
          </button>
        )}
      </div>

      {/* Reseller list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((n) => (
            <div key={n} className="card p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-surface-input" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-surface-input rounded w-1/3" />
                  <div className="h-2 bg-surface-input rounded w-1/4" />
                </div>
                <div className="h-4 bg-surface-input rounded w-20" />
              </div>
            </div>
          ))}
        </div>
      ) : resellerGroups.length === 0 ? (
        <div className="card p-8 text-center">
          <Store className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-sm text-slate-500">
            {hasFilter ? 'Aucun résultat pour ces filtres' : 'Aucune vente grossiste sur la période'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {resellerGroups.map((r, i) => {
            const isExpanded = expanded === r.reseller_id;
            const products   = Array.from(r.products.values()).sort((a, b) => b.revenue - a.revenue);
            const clientList = Array.from(r.clients.values()).sort();
            const maxProdRev = products[0]?.revenue ?? 1;

            return (
              <div key={r.reseller_id} className="card overflow-hidden">
                {/* Row header */}
                <button
                  onClick={() => setExpanded(isExpanded ? null : r.reseller_id)}
                  className="w-full p-4 flex items-center gap-3 text-left hover:bg-surface-hover transition-colors"
                >
                  <span className="text-xs font-mono text-slate-500 w-5 shrink-0">{i + 1}</span>
                  <div className="w-9 h-9 rounded-xl bg-amber-900/30 border border-amber-800/50 flex items-center justify-center text-sm font-bold text-amber-400 shrink-0">
                    {r.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{r.name}</p>
                    <p className="text-xs text-slate-500">
                      {r.order_ids.size} cmd
                      {r.clients.size > 0 && ` · ${r.clients.size} client${r.clients.size > 1 ? 's' : ''}`}
                      {` · ${r.products.size} produit${r.products.size > 1 ? 's' : ''}`}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-amber-400 shrink-0 mr-2">{fmt(r.revenue)}</p>
                  {isExpanded
                    ? <ChevronDown  className="w-4 h-4 text-slate-400 shrink-0" />
                    : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  }
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-surface-border divide-y divide-surface-border">

                    {/* Clients */}
                    {clientList.length > 0 && (
                      <div className="px-4 py-3">
                        <p className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1.5">
                          <Users className="w-3 h-3" /> Clients
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {clientList.map((name) => (
                            <span
                              key={name}
                              className="text-xs px-2 py-0.5 rounded-full bg-sky-900/30 border border-sky-800/50 text-sky-300 cursor-pointer hover:bg-sky-900/50"
                              onClick={() => {
                                const entry = Array.from(r.clients.entries()).find(([, n]) => n === name);
                                if (entry) setClientFilter(entry[0] === clientFilter ? '' : entry[0]);
                              }}
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Products */}
                    <div className="px-4 py-3">
                      <p className="text-xs font-semibold text-slate-400 mb-3 flex items-center gap-1.5">
                        <Package className="w-3 h-3" /> Produits vendus
                      </p>
                      <div className="space-y-2.5">
                        {products.map((p) => {
                          const pct = (p.revenue / maxProdRev) * 100;
                          return (
                            <div key={p.name} className="flex items-center gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex justify-between text-xs mb-0.5">
                                  <span className="text-slate-200 truncate">{p.name}</span>
                                  <span className="text-amber-400 shrink-0 ml-2">{fmt(p.revenue)}</span>
                                </div>
                                <div className="h-1 bg-surface-input rounded-full overflow-hidden">
                                  <div className="h-full bg-amber-700 rounded-full" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                              <span className="text-xs text-slate-500 w-16 text-right shrink-0">
                                {p.quantity} unités
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
