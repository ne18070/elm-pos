'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { RankBar } from './Charts';
import { useProducts } from '@/hooks/useProducts';
import { getProductSales, type ProductSalesResult } from '@services/supabase/analytics';
import { useNotificationStore } from '@/store/notifications';
import type { AnalyticsSummary } from '@pos-types';

interface ProductsTabProps {
  loading: boolean;
  data: AnalyticsSummary | null;
  period: number;
  fmt: (n: number) => string;
  businessId: string;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ProductSalesLookup({ businessId, period, fmt }: { businessId: string; period: number; fmt: (n: number) => string }) {
  const { products } = useProducts(businessId, false, { includeInactive: true });
  const { error: notifError } = useNotificationStore();

  const [search, setSearch]     = useState('');
  const [productId, setProductId] = useState('');
  const [from, setFrom]   = useState(() => daysAgoISO(period > 0 ? period : 30));
  const [to, setTo]       = useState(() => todayISO());
  const [busy, setBusy]   = useState(false);
  const [result, setResult] = useState<(ProductSalesResult & { productName: string; from: string; to: string }) | null>(null);

  // Suivre le sélecteur de période global tant que l'utilisateur n'a pas
  // touché aux dates manuellement.
  const [dirtyDates, setDirtyDates] = useState(false);
  useEffect(() => {
    if (dirtyDates) return;
    setFrom(daysAgoISO(period > 0 ? period : 30));
    setTo(todayISO());
  }, [period, dirtyDates]);

  const options = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? products.filter((p) => p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q))
      : products;
    return list.slice(0, 200);
  }, [products, search]);

  async function run() {
    if (!productId || !from || !to) return;
    const p = products.find((x) => x.id === productId);
    setBusy(true);
    try {
      const res = await getProductSales(businessId, productId, from, to);
      setResult({ ...res, productName: p?.name ?? '—', from, to });
    } catch (e) {
      notifError('Erreur lors du calcul des ventes du produit');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-content-secondary">Ventes d&apos;un produit sur une période</h2>
        <p className="text-xs text-content-muted mt-0.5">Quantité vendue, chiffre d&apos;affaires et nombre de commandes — ventes finalisées uniquement.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="label">Produit</label>
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-secondary" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrer par nom ou référence…"
              className="input pl-10 w-full"
            />
          </div>
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="input w-full"
          >
            <option value="">— Choisir un produit —</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.sku ? ` · ${p.sku}` : ''}{p.is_active === false ? ' (archivé)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Du</label>
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => { setFrom(e.target.value); setDirtyDates(true); }}
            className="input w-full"
          />
        </div>
        <div>
          <label className="label">Au</label>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => { setTo(e.target.value); setDirtyDates(true); }}
            className="input w-full"
          />
        </div>
      </div>

      <button
        onClick={run}
        disabled={busy || !productId || !from || !to}
        className="btn-primary flex items-center justify-center gap-2 w-full sm:w-auto"
      >
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        Calculer
      </button>

      {result && (
        <div className="rounded-xl border border-surface-border bg-surface-card p-3">
          <p className="text-xs text-content-muted mb-2">
            <span className="font-medium text-content-primary">{result.productName}</span>
            {' · '}{result.from} → {result.to}
          </p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xl font-bold text-content-primary">{result.quantity_sold}</p>
              <p className="text-xs text-content-secondary">unité{result.quantity_sold !== 1 ? 's' : ''} vendue{result.quantity_sold !== 1 ? 's' : ''}</p>
            </div>
            <div>
              <p className="text-xl font-bold text-content-primary">{fmt(result.revenue)}</p>
              <p className="text-xs text-content-secondary">chiffre d&apos;affaires</p>
            </div>
            <div>
              <p className="text-xl font-bold text-content-primary">{result.order_count}</p>
              <p className="text-xs text-content-secondary">commande{result.order_count !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ProductsTab({
  loading,
  data,
  period,
  fmt,
  businessId,
}: ProductsTabProps) {
  const periodLabel = period === 0 ? "aujourd'hui" : `les ${period} derniers jours`;

  if (loading) {
    return (
      <div className="card p-4 space-y-4 animate-pulse">
        <div className="h-4 w-32 bg-surface-hover rounded" />
        <div className="space-y-6">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-3 w-4 bg-surface-hover rounded" />
              <div className="flex-1 space-y-2">
                <div className="flex justify-between">
                  <div className="h-3 w-32 bg-surface-hover rounded" />
                  <div className="h-3 w-16 bg-surface-hover rounded" />
                </div>
                <div className="h-1.5 w-full bg-surface-hover rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <ProductSalesLookup businessId={businessId} period={period} fmt={fmt} />

      <div className="card p-4">
        <h2 className="text-sm font-semibold text-content-secondary mb-4">Top produits</h2>
        {!data || data.top_products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-content-muted">
            <p className="text-sm">Aucune vente enregistrée sur {periodLabel}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.top_products.map((p, i) => {
              const maxRev = data.top_products[0].revenue;
              return (
                <div key={p.product_id} className="flex items-center gap-3">
                  <span className="text-xs font-mono text-content-muted w-4 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <RankBar
                      label={p.name}
                      value={p.revenue}
                      max={maxRev}
                      color="bg-brand-500"
                      fmt={fmt}
                      sub={`${p.quantity_sold} ventes`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
