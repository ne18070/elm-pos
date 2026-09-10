'use client';

import { Phone, MapPin, RotateCcw, Trash2, X, Tag, Gift } from 'lucide-react';
import type { Reseller, ResellerClient } from '@services/supabase/resellers';
import type { Business, Coupon } from '@pos-types';
import { useQuickOrderStore } from '@/store/quickOrder';
import { computeQuickTotals } from '@/lib/quick-order-totals';
import { echeance } from '@/lib/invoice-templates';
import { RESELLER_TYPE_LABELS as TYPE_LABELS, RESELLER_TYPE_BADGE as TYPE_COLORS } from '@/lib/reseller-format';
import { CouponPicker } from '@/components/pos/CouponPicker';
import { ClientPicker } from '@/components/commande-rapide/ClientPicker';
import { formatCurrency, cn } from '@/lib/utils';

interface Props {
  reseller: Reseller;
  clients: ResellerClient[];
  business: Business;
  currency: string;
  hasCashSession: boolean;
  hasOverStock: boolean;
  canRecall: boolean;
  recalling: boolean;
  onRecall: () => void;
  onFinalize: (mode: 'bl' | 'cash' | 'acompte') => void;
  onCouponAdd: (c: Coupon) => void;
  onCouponRemove: (id: string) => void;
}

export function OrderSummary({
  reseller, clients, business, currency, hasCashSession, hasOverStock, canRecall, recalling,
  onRecall, onFinalize, onCouponAdd, onCouponRemove,
}: Props) {
  const lines = useQuickOrderStore((s) => s.lines);
  const clientId = useQuickOrderStore((s) => s.clientId);
  const setClient = useQuickOrderStore((s) => s.setClient);
  const deliveryAddress = useQuickOrderStore((s) => s.deliveryAddress);
  const setDeliveryAddress = useQuickOrderStore((s) => s.setDeliveryAddress);
  const notes = useQuickOrderStore((s) => s.notes);
  const setNotes = useQuickOrderStore((s) => s.setNotes);
  const coupons = useQuickOrderStore((s) => s.coupons);
  const clear = useQuickOrderStore((s) => s.clear);

  const t = computeQuickTotals(lines, coupons);
  const empty = t.itemCount === 0;
  const blocked = empty || hasOverStock;
  const fmt = (n: number) => formatCurrency(n, currency);
  const showEcheance = Boolean(business.brand_config?.echeance_enabled);

  return (
    <div className="w-72 shrink-0 border-l border-surface-border flex flex-col">
      {/* Revendeur */}
      <div className="px-4 py-3 border-b border-surface-border">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-content-primary">{reseller.name}</span>
          <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', TYPE_COLORS[reseller.type ?? 'gros'])}>
            {TYPE_LABELS[reseller.type ?? 'gros']}
          </span>
        </div>
        {reseller.phone && (
          <p className="text-xs text-content-secondary flex items-center gap-1 mt-1">
            <Phone className="w-3 h-3" />{reseller.phone}
          </p>
        )}
        {reseller.zone && (
          <p className="text-xs text-content-secondary flex items-center gap-1">
            <MapPin className="w-3 h-3" />{reseller.zone}
          </p>
        )}
        <button
          onClick={onRecall}
          disabled={!canRecall || recalling}
          className="mt-2 w-full h-8 text-xs flex items-center justify-center gap-1.5 rounded-lg border border-surface-border text-content-secondary hover:text-content-primary hover:border-brand-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <RotateCcw className={cn('w-3.5 h-3.5', recalling && 'animate-spin')} />
          Reprendre la dernière commande
        </button>
      </div>

      {/* Détails + promotions */}
      <div className="px-4 py-3 border-b border-surface-border space-y-3 overflow-y-auto custom-scrollbar">
        <div>
          <label className="label">Client final</label>
          <ClientPicker clients={clients} value={clientId} onChange={setClient} />
        </div>
        <div>
          <label className="label">Adresse de livraison</label>
          <input
            className="input h-9 text-sm"
            value={deliveryAddress}
            onChange={(e) => setDeliveryAddress(e.target.value)}
            placeholder="Optionnel"
          />
        </div>

        <div className="space-y-2">
          {coupons.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {coupons.map((c) => (
                <span
                  key={c.id}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium',
                    c.type === 'free_item'
                      ? 'bg-badge-warning border border-status-warning text-status-warning'
                      : 'bg-badge-success border border-status-success text-status-success',
                  )}
                >
                  {c.type === 'free_item' ? <Gift className="w-3 h-3" /> : <Tag className="w-3 h-3" />}
                  {c.code}
                  <button onClick={() => onCouponRemove(c.id)} className="opacity-70 hover:opacity-100">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <CouponPicker
            businessId={business.id}
            currency={currency}
            orderTotal={t.subtotal}
            cartItemCount={t.itemCount}
            selectedIds={coupons.map((c) => c.id)}
            onAdd={onCouponAdd}
            onRemove={onCouponRemove}
          />
        </div>

        <div>
          <label className="label">Note</label>
          <textarea
            className="input text-sm resize-none"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optionnel"
          />
        </div>
      </div>

      {/* Totaux — mêmes lignes que la facture distributeur */}
      <div className="px-4 py-3 border-b border-surface-border space-y-1.5 text-sm tabular-nums">
        <div className="flex justify-between text-content-secondary">
          <span>Articles</span><span>{t.itemCount}</span>
        </div>
        <div className="flex justify-between text-content-secondary">
          <span>Sous-total</span><span>{fmt(t.subtotal)}</span>
        </div>
        {t.couponDiscount > 0 && (
          <div className="flex justify-between text-status-success">
            <span>Remise</span><span>-{fmt(t.couponDiscount)}</span>
          </div>
        )}
        <div className="flex justify-between text-content-secondary">
          <span>Total HT</span><span>{fmt(t.totalHT)}</span>
        </div>
        <div className="flex justify-between text-content-secondary">
          <span>TVA 18 %</span><span>{fmt(t.tva)}</span>
        </div>
        <div className="flex justify-between font-semibold text-content-primary pt-1.5 border-t border-surface-border text-base">
          <span>Net à payer</span><span className="text-content-brand">{fmt(t.net)}</span>
        </div>
        {showEcheance && !empty && (
          <p className="text-xs text-content-muted pt-1">{echeance(t.net, business)}</p>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 py-3 mt-auto space-y-2">
        <button
          onClick={() => onFinalize('bl')}
          disabled={blocked}
          className="btn-primary w-full h-11 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Enregistrer le bon de livraison
        </button>
        <div className="flex gap-2">
          <button
            onClick={() => onFinalize('cash')}
            disabled={blocked || !hasCashSession}
            className="btn-secondary flex-1 h-9 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Encaisser
          </button>
          <button
            onClick={() => onFinalize('acompte')}
            disabled={blocked || !hasCashSession}
            className="btn-secondary flex-1 h-9 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Acompte
          </button>
        </div>
        {hasOverStock && (
          <p className="text-[11px] text-status-error">
            Stock insuffisant sur une ou plusieurs lignes — ajustez les quantités.
          </p>
        )}
        {!hasCashSession && !hasOverStock && (
          <p className="text-[11px] text-content-muted">
            Ouvrez une caisse pour encaisser. Le bon de livraison reste possible.
          </p>
        )}
        {!empty && (
          <button
            onClick={() => { if (confirm('Vider la commande ?')) clear(); }}
            className="w-full h-8 text-xs flex items-center justify-center gap-1.5 text-content-muted hover:text-status-error transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Vider la commande
          </button>
        )}
      </div>
    </div>
  );
}
