'use client';

import React from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ChevronRight, Package, Wallet } from 'lucide-react';
import type { GrossMarginEstimate, TopProduct } from '@pos-types';
import type { PaymentMethodStat } from '@services/supabase/analytics';
import type { OrderFilterTotals } from '@services/supabase/orders';
import { RankBar } from './Charts';

const PAYMENT_LABELS: Record<string, string> = {
  cash:         'Espèces',
  card:         'Carte bancaire',
  mobile_money: 'Mobile Money',
  wave:         'Wave',
  orange_money: 'Orange Money',
  free_money:   'Free Money',
  partial:      'Acompte',
  loyalty:      'Points fidélité',
  room_charge:  'Note de chambre',
  free:         'Offert',
  autre:        'Autre',
};

const paymentLabel = (m: string) =>
  PAYMENT_LABELS[m] ?? m.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

function CardShell({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h2 className="text-sm font-semibold text-content-secondary">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function RowsSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {[0, 1, 2, 3].map((i) => (
        <div key={i}>
          <div className="h-3 w-2/3 bg-surface-hover rounded mb-2" />
          <div className="h-1.5 w-full bg-surface-hover rounded" />
        </div>
      ))}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-8 text-center text-xs text-content-muted border border-dashed border-surface-border rounded-xl">
      {children}
    </p>
  );
}

// ── À surveiller ──────────────────────────────────────────────────────────────

export interface WatchItem {
  key: string;
  icon: React.ElementType;
  title: string;
  detail: string;
  href: string;
}

/**
 * Ce qui demande une action maintenant, avec un lien direct vers l'écran qui la
 * permet. Indépendant de la période : un solde dû d'il y a 3 mois reste à relancer.
 */
export function WatchList({ items, loading }: { items: WatchItem[]; loading: boolean }) {
  if (loading) return null;
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-surface-border bg-surface-card text-sm text-content-secondary">
        <CheckCircle2 className="w-4 h-4 text-status-success shrink-0" aria-hidden />
        Rien à signaler : aucun solde à relancer, stocks suffisants.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-surface-border bg-surface-card divide-y divide-surface-border">
      <p className="px-4 pt-3 pb-2 text-xs font-semibold text-content-secondary flex items-center gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5 text-status-warning" aria-hidden /> À surveiller
      </p>
      {items.map(({ key, icon: Icon, title, detail, href }) => (
        <Link key={key} href={href}
          className="flex items-center gap-3 px-4 py-3 min-h-[44px] hover:bg-surface-hover transition-colors">
          <Icon className="w-4 h-4 text-status-warning shrink-0" aria-hidden />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium text-content-primary">{title}</span>
            <span className="block text-xs text-content-muted truncate">{detail}</span>
          </span>
          <ChevronRight className="w-4 h-4 text-content-muted shrink-0" aria-hidden />
        </Link>
      ))}
    </div>
  );
}

export function buildWatchItems({
  receivables, lowStock, outOfStock, fmt,
}: {
  receivables: OrderFilterTotals | null;
  lowStock: number | null;
  outOfStock: number;
  fmt: (n: number) => string;
}): WatchItem[] {
  const items: WatchItem[] = [];
  if (receivables && receivables.count > 0) {
    items.push({
      key: 'receivables', icon: Wallet, href: '/orders?tab=acompte',
      title: `${fmt(receivables.balanceDue)} à encaisser`,
      detail: `${receivables.count} vente${receivables.count > 1 ? 's' : ''} avec un solde dû, à relancer`,
    });
  }
  if (lowStock && lowStock > 0) {
    items.push({
      key: 'stock', icon: Package, href: '/approvisionnement',
      title: `${lowStock} produit${lowStock > 1 ? 's' : ''} à réapprovisionner`,
      detail: outOfStock > 0 ? `dont ${outOfStock} en rupture` : 'Stock faible',
    });
  }
  return items;
}

// ── Top produits ──────────────────────────────────────────────────────────────

export function TopProductsCard({
  products, loading, fmt, onSeeAll, margin,
}: {
  products: TopProduct[];
  loading: boolean;
  fmt: (n: number) => string;
  onSeeAll?: () => void;
  /** Fourni seulement si l'utilisateur a la permission view_financials. */
  margin?: GrossMarginEstimate | null;
}) {
  const top = products.slice(0, 5);
  const max = top[0]?.revenue ?? 0;
  const pct = (part: number, whole: number) => Math.round((part / (whole || 1)) * 100);
  const hasMargin = !!margin && margin.revenue_with_cost > 0;
  const coverage = margin ? pct(margin.revenue_with_cost, margin.revenue_total) : 0;

  return (
    <CardShell
      title="Meilleures ventes"
      action={onSeeAll && top.length > 0 && (
        <button type="button" onClick={onSeeAll} className="text-xs font-medium text-content-brand hover:underline min-h-[44px] px-1">
          Tout voir
        </button>
      )}
    >
      {!loading && hasMargin && margin && (
        <div className="-mt-2 mb-4 rounded-lg bg-surface-input px-3 py-2">
          <p className="text-xs text-content-secondary">
            Marge brute estimée{' '}
            <span className="font-semibold text-content-primary tabular-nums">
              {fmt(margin.revenue_with_cost - margin.cost)}
            </span>{' '}
            <span className="text-content-muted">
              ({pct(margin.revenue_with_cost - margin.cost, margin.revenue_with_cost)} % des ventes)
            </span>
          </p>
          <p className="mt-0.5 text-[11px] text-content-muted">
            Au prix d&apos;achat actuel des produits
            {coverage < 95 && ` · calculée sur ${coverage} % du CA produits, prix d'achat manquant pour le reste`}
          </p>
        </div>
      )}
      {loading ? <RowsSkeleton /> : top.length === 0 ? (
        <Empty>Aucune vente finalisée sur la période</Empty>
      ) : (
        <div className="space-y-3">
          {top.map((p) => {
            const qty = `${p.quantity_sold} vendu${p.quantity_sold > 1 ? 's' : ''}`;
            const m = margin && p.unit_cost != null && p.revenue > 0
              ? ` · marge ${pct(p.revenue - p.quantity_sold * p.unit_cost, p.revenue)} %`
              : '';
            return (
              <RankBar key={p.product_id} label={p.name} sub={qty + m}
                value={p.revenue} max={max} color="bg-brand-500" fmt={fmt} />
            );
          })}
        </div>
      )}
    </CardShell>
  );
}

// ── Moyens de paiement ────────────────────────────────────────────────────────

export function PaymentsCard({
  payments, loading, fmt,
}: {
  payments: PaymentMethodStat[];
  loading: boolean;
  fmt: (n: number) => string;
}) {
  const total = payments.reduce((s, p) => s + p.amount, 0);
  const max = payments[0]?.amount ?? 0;
  return (
    <CardShell title="Encaissements par moyen de paiement">
      {loading ? <RowsSkeleton /> : payments.length === 0 ? (
        <Empty>Aucun encaissement en caisse sur la période</Empty>
      ) : (
        <div className="space-y-3">
          {payments.map((p) => (
            <RankBar key={p.method} label={paymentLabel(p.method)}
              sub={`${Math.round((p.amount / (total || 1)) * 100)} % · ${p.count} paiement${p.count > 1 ? 's' : ''}`}
              value={p.amount} max={max} color="bg-brand-500" fmt={fmt} />
          ))}
        </div>
      )}
    </CardShell>
  );
}
