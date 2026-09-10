'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Trash2, Search, Gift, ChevronLeft } from 'lucide-react';
import type { QuickProductInput, QuickVariant, QuickLine } from '@/store/quickOrder';
import { useQuickOrderStore } from '@/store/quickOrder';
import { useNotificationStore } from '@/store/notifications';
import { formatCurrency, cn } from '@/lib/utils';

interface Props {
  products: QuickProductInput[];
  currency: string;
}

const num = (v: string) => {
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

// TTC → HT (TVA 18 % incluse — cf. facture distributeur).
const toHT = (ttc: number) => ttc / 1.18;

const CELL_INPUT =
  'w-full bg-transparent text-right tabular-nums border border-transparent hover:border-surface-border focus:border-brand-500 focus:bg-surface-input rounded-md px-2 py-1 outline-none transition-colors';

/**
 * Cellule numérique éditable (quantité, P.U.) : tampon local pour autoriser
 * la saisie intermédiaire (`12.`, champ vidé…), validé au blur / Entrée.
 * `onCommit` renvoie `false` si la valeur est refusée → la cellule revient
 * à l'ancienne valeur.
 */
function NumCell({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (n: number) => boolean;
}) {
  const [buf, setBuf] = useState(String(value));
  useEffect(() => { setBuf(String(value)); }, [value]);

  function commit() {
    if (buf.trim() === '') { setBuf(String(value)); return; }
    const parsed = num(buf);
    if (parsed === value) { setBuf(String(value)); return; }
    if (!onCommit(parsed)) setBuf(String(value));
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={buf}
      onChange={(e) => setBuf(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      className={CELL_INPUT}
    />
  );
}

export function OrderGrid({ products, currency }: Props) {
  const lines = useQuickOrderStore((s) => s.lines);
  const addProduct = useQuickOrderStore((s) => s.addProduct);
  const setQty = useQuickOrderStore((s) => s.setQty);
  const setUnitPrice = useQuickOrderStore((s) => s.setUnitPrice);
  const removeLine = useQuickOrderStore((s) => s.removeLine);
  const { warning } = useNotificationStore();

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const [search, setSearch] = useState('');
  const [hi, setHi] = useState(0);
  const [variantOf, setVariantOf] = useState<QuickProductInput | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const closeSearch = useCallback(() => { setSearch(''); setVariantOf(null); setHi(0); }, []);

  // Ferme le menu au clic à l'extérieur (comme le sélecteur client du POS).
  useEffect(() => {
    if (!search && !variantOf) return;
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) closeSearch();
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [search, variantOf, closeSearch]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q))
      .slice(0, 7);
  }, [products, search]);

  const fmt = (n: number) => formatCurrency(n, currency);

  /** Unités de stock déjà consommées pour un produit, hors une ligne donnée. */
  const consumedFor = useCallback(
    (productId: string, exceptLineId?: string) =>
      lines
        .filter((l) => l.product_id === productId && l.id !== exceptLineId)
        .reduce((s, l) => s + l.qty * (l.stock_consumption ?? 1), 0),
    [lines],
  );

  /** Vrai si `qty` tient dans le stock (règle POS : conso × qté + autres lignes ≤ stock). */
  const fits = useCallback(
    (product: QuickProductInput | undefined, qty: number, consumption: number, exceptLineId?: string) => {
      if (!product?.track_stock) return true;
      const stock = product.stock ?? 0;
      return qty * consumption + consumedFor(product.id, exceptLineId) <= stock + 1e-6;
    },
    [consumedFor],
  );

  const stockMsg = (product: QuickProductInput) => {
    const left = (product.stock ?? 0) - consumedFor(product.id);
    return `Stock insuffisant — ${Math.max(0, left)} ${product.unit ?? 'unité(s)'} disponible${left > 1 ? 's' : ''}.`;
  };

  const resetSearch = () => { closeSearch(); searchRef.current?.focus(); };

  const pickProduct = useCallback(
    (p: QuickProductInput | undefined) => {
      if (!p) return;
      if (p.variants && p.variants.length > 0) { setVariantOf(p); setHi(0); return; }
      const consumption = 1;
      const existing = lines.find((l) => l.product_id === p.id && !l.variant_id && !l.is_gift);
      const nextQty = (existing?.qty ?? 0) + 1;
      if (!fits(p, nextQty, consumption)) { warning(stockMsg(p)); return; }
      addProduct(p);
      resetSearch();
    },
    [lines, addProduct, fits, warning],
  );

  const pickVariant = useCallback(
    (p: QuickProductInput, v: QuickVariant) => {
      const consumption = v.stock_consumption ?? 1;
      const existing = lines.find((l) => l.product_id === p.id && l.variant_id === v.id && !l.is_gift);
      const nextQty = (existing?.qty ?? 0) + 1;
      if (!fits(p, nextQty, consumption)) { warning(stockMsg(p)); return; }
      addProduct(p, v);
      resetSearch();
    },
    [lines, addProduct, fits, warning],
  );

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (variantOf) {
      const vs = variantOf.variants ?? [];
      if (e.key === 'ArrowDown') { e.preventDefault(); setHi((i) => Math.min(i + 1, vs.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((i) => Math.max(i - 1, 0)); }
      else if (e.key === 'Enter') { e.preventDefault(); if (vs[hi]) pickVariant(variantOf, vs[hi]); }
      else if (e.key === 'Escape') { setVariantOf(null); setHi(0); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((i) => Math.min(i + 1, matches.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); pickProduct(matches[hi]); }
    else if (e.key === 'Escape') { setSearch(''); }
  };

  const commitQty = (line: QuickLine, qty: number): boolean => {
    if (qty <= 0) { removeLine(line.id); return true; }
    const p = byId.get(line.product_id);
    const consumption = line.stock_consumption ?? 1;
    if (!p?.track_stock) { setQty(line.id, qty); return true; }

    const stock = p.stock ?? 0;
    const other = consumedFor(line.product_id, line.id);
    if (qty * consumption + other > stock + 1e-6) {
      const maxQty = Math.floor((stock - other) / consumption);
      warning(
        `Stock insuffisant — ${Math.max(0, maxQty)} ${p.unit ?? 'unité(s)'} maximum pour « ${line.name} ».`,
      );
      if (maxQty > 0) { setQty(line.id, maxQty); return true; } // ramené au maximum saisissable
      return false; // rien de disponible → la cellule revient en arrière
    }
    setQty(line.id, qty);
    return true;
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      {/* Recherche / ajout */}
      <div ref={boxRef} className="px-4 py-2.5 border-b border-surface-border relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted pointer-events-none" />
          <input
            ref={searchRef}
            className="input pl-9 h-10"
            placeholder="Ajouter un article — nom ou référence, puis Entrée"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setHi(0); setVariantOf(null); }}
            onKeyDown={onSearchKey}
          />
        </div>

        {/* Niveau 1 : produits */}
        {!variantOf && matches.length > 0 && (
          <div className="absolute left-4 right-4 top-full mt-1 z-20 bg-surface-card border border-surface-border rounded-xl shadow-2xl overflow-hidden">
            {matches.map((p, i) => {
              const left = (p.stock ?? 0) - consumedFor(p.id);
              return (
                <button
                  key={p.id}
                  onMouseDown={(e) => { e.preventDefault(); pickProduct(p); }}
                  onMouseEnter={() => setHi(i)}
                  className={cn(
                    'w-full flex items-center justify-between gap-3 px-3 py-2 text-left',
                    i === hi ? 'bg-surface-hover' : '',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-content-primary truncate">
                      {p.name}
                      {p.variants && p.variants.length > 0 && (
                        <span className="ml-2 text-[10px] text-content-muted">
                          {p.variants.length} variante{p.variants.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-content-muted truncate">
                      Réf. {p.sku || '—'}
                      {p.track_stock && (
                        <span className={cn('ml-2', left <= 0 && 'text-status-error')}>
                          · Stock {Math.max(0, left)}{p.unit ? ` ${p.unit}` : ''}
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-content-muted">
                    {fmt(p.wholesale_price ?? p.price)}
                    {p.wholesale_price != null && p.wholesale_price !== p.price && (
                      <span className="ml-1.5 line-through opacity-50">{fmt(p.price)}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Niveau 2 : variantes */}
        {variantOf && (
          <div className="absolute left-4 right-4 top-full mt-1 z-20 bg-surface-card border border-surface-border rounded-xl shadow-2xl overflow-hidden">
            <button
              onMouseDown={(e) => { e.preventDefault(); setVariantOf(null); setHi(0); }}
              className="w-full flex items-center gap-1.5 px-3 py-2 text-xs text-content-secondary hover:bg-surface-hover border-b border-surface-border"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> {variantOf.name} — choisir une variante
            </button>
            {(variantOf.variants ?? []).map((v, i) => {
              const finalPrice = (variantOf.wholesale_price ?? variantOf.price) + (v.price_modifier ?? 0);
              const consumption = v.stock_consumption ?? 1;
              const ok = fits(variantOf, 1, consumption);
              const maxQty = variantOf.track_stock
                ? Math.floor(Math.max(0, (variantOf.stock ?? 0) - consumedFor(variantOf.id)) / consumption)
                : null;
              return (
                <button
                  key={v.id}
                  disabled={!ok}
                  onMouseDown={(e) => { e.preventDefault(); pickVariant(variantOf, v); }}
                  onMouseEnter={() => setHi(i)}
                  className={cn(
                    'w-full flex items-center justify-between gap-3 px-3 py-2 text-left',
                    !ok ? 'opacity-40 cursor-not-allowed' : i === hi ? 'bg-surface-hover' : '',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-content-primary truncate">{v.name}</p>
                    <p className="text-[10px] text-content-muted truncate">
                      Réf. {v.sku || variantOf.sku || '—'}
                      {consumption !== 1 && ` · ${consumption} ${variantOf.unit ?? 'unité'}/u`}
                      {maxQty != null && (
                        <span className={cn('ml-2', maxQty <= 0 && 'text-status-error')}>
                          · {maxQty <= 0 ? 'Épuisé' : `${maxQty} dispo`}
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-content-brand font-medium">{fmt(finalPrice)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Grille */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        {lines.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-content-muted gap-2 px-6 text-center">
            <p className="text-sm">Aucun article.</p>
            <p className="text-xs">Ajoutez un produit ci-dessus ou reprenez une commande précédente.</p>
          </div>
        ) : (
          <table className="w-full text-sm min-w-[720px]">
            <thead className="sticky top-0 bg-surface-card z-10">
              <tr className="text-content-muted border-b border-surface-border text-xs">
                <th className="w-9 px-2 py-2 text-left font-medium">#</th>
                <th className="w-24 px-2 py-2 text-left font-medium">Réf.</th>
                <th className="px-2 py-2 text-left font-medium">Désignation</th>
                <th className="w-20 px-2 py-2 text-right font-medium">Stock</th>
                <th className="w-24 px-2 py-2 text-right font-medium">Qtés</th>
                <th className="w-28 px-2 py-2 text-right font-medium">P.U</th>
                <th className="w-28 px-2 py-2 text-right font-medium">Montant HT</th>
                <th className="w-28 px-2 py-2 text-right font-medium">Montant TTC</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => {
                if (l.is_gift) {
                  return (
                    <tr key={l.id} className="border-b border-surface-border/60 bg-badge-success/25">
                      <td className="px-2 py-1.5 align-middle"><Gift className="w-3.5 h-3.5 text-status-success" /></td>
                      <td className="px-2 py-1.5 text-xs text-content-muted align-middle">{l.sku ?? '—'}</td>
                      <td className="px-2 py-1.5 align-middle">
                        <span className="text-content-primary">{l.name}</span>
                        <span className="ml-2 text-[11px] font-medium text-status-warning">
                          {l.note ?? 'offert'}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right align-middle text-content-muted">—</td>
                      <td className="px-2 py-1.5 text-right align-middle tabular-nums text-status-success pr-2">{l.qty}</td>
                      <td className="px-2 py-1.5 text-right align-middle text-content-muted pr-2">—</td>
                      <td className="px-2 py-1.5 text-right align-middle text-content-muted">—</td>
                      <td className="px-2 py-1.5 text-right align-middle tabular-nums text-content-secondary pr-2">{fmt(0)}</td>
                      <td />
                    </tr>
                  );
                }
                const p = byId.get(l.product_id);
                const consumption = l.stock_consumption ?? 1;
                const stock = p?.track_stock ? p.stock ?? 0 : null;
                const over =
                  stock != null && l.qty * consumption + consumedFor(l.product_id, l.id) > stock + 1e-6;
                const ttc = l.unit_price * l.qty;
                return (
                  <tr
                    key={l.id}
                    className={cn(
                      'border-b border-surface-border/60',
                      over ? 'bg-badge-error/40' : 'hover:bg-surface-hover/50',
                    )}
                  >
                    <td className="px-2 py-1.5 text-xs text-content-muted tabular-nums align-middle">{idx + 1}</td>
                    <td className="px-2 py-1.5 text-xs text-content-muted align-middle">{l.sku ?? '—'}</td>
                    <td className="px-2 py-1.5 align-middle text-content-primary">{l.name}</td>
                    <td className="px-2 py-1.5 text-right align-middle tabular-nums">
                      {stock == null ? (
                        <span className="text-content-muted">—</span>
                      ) : (
                        <span className={over ? 'text-status-error font-medium' : 'text-content-muted'}>
                          {stock}{p?.unit ? ` ${p.unit}` : ''}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right align-middle">
                      <NumCell value={l.qty} onCommit={(q) => commitQty(l, q)} />
                    </td>
                    <td className="px-2 py-1.5 text-right align-middle">
                      <NumCell
                        value={l.unit_price}
                        onCommit={(price) => { setUnitPrice(l.id, price); return true; }}
                      />
                      {l.detail_price > 0 && l.detail_price !== l.unit_price && (
                        <div className="text-[10px] text-content-muted line-through pr-2 leading-none">
                          {fmt(l.detail_price)}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right align-middle tabular-nums text-content-secondary">
                      {fmt(toHT(ttc))}
                    </td>
                    <td className="px-2 py-1.5 text-right align-middle tabular-nums text-content-primary font-medium">
                      {fmt(ttc)}
                    </td>
                    <td className="px-1 py-1.5 text-center align-middle">
                      <button
                        onClick={() => removeLine(l.id)}
                        className="p-1 rounded-md text-content-muted hover:text-status-error hover:bg-badge-error transition-colors"
                        title="Retirer la ligne"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Aide clavier */}
      <div className="px-4 py-1.5 border-t border-surface-border flex items-center gap-3 text-[10px] text-content-muted">
        <span className="inline-flex items-center gap-1">
          <kbd className="border border-surface-border rounded px-1 py-0.5 font-sans">Entrée</kbd>
          ajoute l'article
        </span>
        <span className="inline-flex items-center gap-1">
          <kbd className="border border-surface-border rounded px-1 py-0.5 font-sans">Tab</kbd>
          passe d'une cellule à l'autre
        </span>
      </div>
    </div>
  );
}
