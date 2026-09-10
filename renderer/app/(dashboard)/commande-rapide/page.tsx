'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toUserError } from '@/lib/user-error';
import { useAuthStore } from '@/store/auth';
import { useCashSessionStore } from '@/store/cashSession';
import { useNotificationStore } from '@/store/notifications';
import { useCan } from '@/hooks/usePermission';
import { hasFeature } from '@/lib/permissions';
import { useQuickOrderStore } from '@/store/quickOrder';
import type { QuickLine, QuickProductInput } from '@/store/quickOrder';
import { computeQuickTotals } from '@/lib/quick-order-totals';
import { getResellers, getResellerClients } from '@services/supabase/resellers';
import type { Reseller, ResellerClient } from '@services/supabase/resellers';
import { getResellerOrders } from '@services/supabase/quick-order';
import { getProducts } from '@services/supabase/products';
import { createOrder } from '@services/supabase/orders';
import { buildOrderDbPayload } from '@domain/order.service';
import { enqueueToSync } from '@/lib/ipc';
import { isNetworkError, orderErrorMessage } from '@/lib/net';
import { generateDistributeurInvoice, printHtml } from '@/lib/invoice-templates';
import { formatCurrency, generateId } from '@/lib/utils';
import type { Order, Product, PaymentMethod, Coupon } from '@pos-types';
import { ResellerRail } from '@/components/commande-rapide/ResellerRail';
import { OrderGrid } from '@/components/commande-rapide/OrderGrid';
import { OrderSummary } from '@/components/commande-rapide/OrderSummary';
import { FinalizeDialog, type FinalizeMode, type FinalizePayload } from '@/components/commande-rapide/FinalizeDialog';

type ProductRow = Product & { wholesale_price?: number | null };

export default function CommandeRapidePage() {
  const { user, business } = useAuthStore();
  const { session: cashSession } = useCashSessionStore();
  const { success, error: notifError, warning } = useNotificationStore();
  const can = useCan();

  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [clients, setClients] = useState<ResellerClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [recalling, setRecalling] = useState(false);
  const [finalizeMode, setFinalizeMode] = useState<FinalizeMode | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

  const activeResellerId = useQuickOrderStore((s) => s.activeResellerId);
  const lines = useQuickOrderStore((s) => s.lines);
  const coupons = useQuickOrderStore((s) => s.coupons);
  const clientId = useQuickOrderStore((s) => s.clientId);
  const notes = useQuickOrderStore((s) => s.notes);
  const deliveryAddress = useQuickOrderStore((s) => s.deliveryAddress);
  const draftsByReseller = useQuickOrderStore((s) => s.draftsByReseller);
  const setReseller = useQuickOrderStore((s) => s.setReseller);
  const addCoupon = useQuickOrderStore((s) => s.addCoupon);
  const removeCoupon = useQuickOrderStore((s) => s.removeCoupon);
  const reconcileCoupons = useQuickOrderStore((s) => s.reconcileCoupons);
  const addGiftLine = useQuickOrderStore((s) => s.addGiftLine);
  const removeGiftLine = useQuickOrderStore((s) => s.removeGiftLine);
  const replaceLines = useQuickOrderStore((s) => s.replaceLines);
  const clear = useQuickOrderStore((s) => s.clear);

  const currency = business?.currency ?? 'XOF';
  const reseller = useMemo(
    () => resellers.find((r) => r.id === activeResellerId) ?? null,
    [resellers, activeResellerId],
  );
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const productInputs: QuickProductInput[] = useMemo(
    () =>
      products.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku ?? null,
        unit: p.unit ?? null,
        price: p.price,
        wholesale_price: p.wholesale_price ?? null,
        track_stock: p.track_stock,
        stock: p.stock,
        variants: (p.variants ?? []).map((v) => ({
          id: v.id,
          name: v.name,
          price_modifier: v.price_modifier ?? 0,
          sku: v.sku ?? null,
          stock_consumption: v.stock_consumption,
        })),
      })),
    [products],
  );
  const productInputById = useMemo(
    () => new Map(productInputs.map((p) => [p.id, p])),
    [productInputs],
  );
  const totals = useMemo(() => computeQuickTotals(lines, coupons), [lines, coupons]);

  // Blocage type POS : la commande ne peut pas dépasser le stock disponible.
  const hasOverStock = useMemo(() => {
    const consumed = new Map<string, number>();
    for (const l of lines) {
      consumed.set(l.product_id, (consumed.get(l.product_id) ?? 0) + l.qty * (l.stock_consumption ?? 1));
    }
    for (const [pid, used] of consumed) {
      const p = productInputById.get(pid);
      if (p?.track_stock && used > (p.stock ?? 0) + 1e-6) return true;
    }
    return false;
  }, [lines, productInputById]);

  useEffect(() => {
    if (!business) return;
    let alive = true;
    setLoading(true);
    Promise.all([getResellers(business.id), getProducts(business.id)])
      .then(([r, p]) => {
        if (!alive) return;
        setResellers(r);
        setProducts(p as ProductRow[]);
      })
      .catch((e) => { if (alive) notifError(toUserError(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id]);

  useEffect(() => {
    if (!activeResellerId) { setClients([]); return; }
    let alive = true;
    getResellerClients(activeResellerId)
      .then((c) => { if (alive) setClients(c); })
      .catch(() => { if (alive) setClients([]); });
    return () => { alive = false; };
  }, [activeResellerId]);

  // Règle POS : à chaque changement de commande, retirer les coupons dont le
  // seuil (montant / quantité) n'est plus atteint, et prévenir.
  useEffect(() => {
    const dropped = reconcileCoupons();
    if (dropped.length > 0) {
      warning(
        dropped.length === 1
          ? `Coupon « ${dropped[0].code} » retiré : conditions de la commande non remplies.`
          : `${dropped.length} coupons retirés : conditions de la commande non remplies.`,
      );
    }
  }, [lines, reconcileCoupons, warning]);

  const handleCouponAdd = useCallback(
    (c: Coupon) => {
      if (c.type === 'free_item' && c.free_item_product_id) {
        const p = productMap.get(c.free_item_product_id);
        if (!p) {
          notifError("Le produit offert par ce coupon est introuvable.");
          return;
        }
        // Même logique que le panier POS (handleCouponAdd) : unité offerte
        // = unité de vente ou sous-unité, P.U. réel = prix détail × conso.
        const qty = c.free_item_quantity ?? 1;
        const consumption =
          c.free_item_stock_consumption && c.free_item_stock_consumption > 0
            ? c.free_item_stock_consumption
            : 1;
        const unit = c.free_item_unit_label?.trim() || p.unit || 'pièce';
        const note = `Offert · P.U. ${formatCurrency(p.price * consumption, currency)} / ${unit}`;
        addGiftLine(
          { id: p.id, name: p.name, sku: p.sku ?? null, unit: p.unit ?? null, price: p.price },
          qty,
          note,
          consumption,
        );
      }
      addCoupon(c);
    },
    [productMap, currency, addGiftLine, addCoupon, notifError],
  );

  const handleCouponRemove = useCallback(
    (id: string) => {
      const c = coupons.find((x) => x.id === id);
      if (c?.type === 'free_item' && c.free_item_product_id) removeGiftLine(c.free_item_product_id);
      removeCoupon(id);
    },
    [coupons, removeGiftLine, removeCoupon],
  );

  const handleRecall = useCallback(async () => {
    if (!business || !activeResellerId) return;
    if (
      useQuickOrderStore.getState().lines.length > 0 &&
      !confirm('Remplacer la commande en cours par la dernière commande de ce revendeur ?')
    ) return;

    setRecalling(true);
    try {
      const [last] = await getResellerOrders(business.id, activeResellerId, 1);
      // Capage au stock disponible : une quantité hors stock ne peut pas entrer,
      // même par reprise. On cumule par produit pour les lignes multiples.
      const remaining = new Map<string, number>();
      let capped = false;
      const newLines: QuickLine[] = [];
      for (const it of last?.items ?? []) {
        if (it.price <= 0) continue;
        const p = productMap.get(it.product_id);
        const v = it.variant_id ? p?.variants?.find((x) => x.id === it.variant_id) : undefined;
        const consumption = v?.stock_consumption && v.stock_consumption !== 1 ? v.stock_consumption : 1;

        let qty = it.quantity;
        if (p?.track_stock) {
          const left = remaining.get(it.product_id) ?? (p.stock ?? 0);
          const maxQty = Math.floor(left / consumption);
          if (qty > maxQty) { qty = Math.max(0, maxQty); capped = true; }
          remaining.set(it.product_id, left - qty * consumption);
        }
        if (qty <= 0) continue;

        newLines.push({
          id: generateId(),
          product_id: it.product_id,
          variant_id: it.variant_id,
          name: it.name,
          sku: v?.sku ?? p?.sku ?? null,
          unit: p?.unit ?? null,
          qty,
          unit_price: it.price,
          detail_price: p?.price ?? it.price,
          stock_consumption: consumption !== 1 ? consumption : undefined,
        });
      }
      if (newLines.length === 0) {
        warning('Aucune commande précédente à reprendre pour ce revendeur.');
        return;
      }
      replaceLines(newLines);
      const when = new Date(last!.created_at).toLocaleDateString('fr-FR');
      if (capped) {
        warning(`Commande du ${when} reprise — quantités ajustées au stock disponible.`);
      } else {
        success(`${newLines.length} ligne(s) reprise(s) — commande du ${when}.`);
      }
    } catch (e) {
      notifError(toUserError(e));
    } finally {
      setRecalling(false);
    }
  }, [business, activeResellerId, productMap, replaceLines, success, warning, notifError]);

  const buildInvoiceOrder = useCallback(
    (order: Order, p: FinalizePayload, customerName: string, customerPhone: string): Order => {
      const items = lines
        .filter((l) => l.qty > 0)
        .map((l) => ({
          product_id: l.product_id,
          variant_id: l.variant_id,
          name: l.name,
          price: l.is_gift ? 0 : l.unit_price,
          quantity: l.qty,
          total: l.is_gift ? 0 : Math.round(l.unit_price * l.qty * 100) / 100,
          discount_amount: 0,
          notes: l.note,
          product: { sku: l.sku ?? undefined },
        }));
      const paidNow = p.mode === 'bl' ? 0 : p.mode === 'acompte' ? p.amount : totals.net;
      return {
        ...order,
        items,
        subtotal: totals.subtotal,
        total: totals.net,
        tax_amount: 0,
        discount_amount: totals.couponDiscount,
        customer_name: customerName,
        customer_phone: customerPhone,
        payments: paidNow > 0 ? [{ amount: paidNow, method: p.mode === 'cash' ? 'cash' : 'partial' }] : [],
        cashier: order.cashier ?? (user ? { full_name: user.full_name } : undefined),
      } as unknown as Order;
    },
    [lines, totals, user],
  );

  const doFinalize = useCallback(
    async (p: FinalizePayload) => {
      if (!business || !user || !reseller) return;
      setSubmitting(true);
      setFinalizeError(null);

      if (hasOverStock) {
        setSubmitting(false);
        setFinalizeError('Stock insuffisant sur une ou plusieurs lignes — ajustez les quantités.');
        return;
      }

      const client = clients.find((c) => c.id === clientId) ?? null;
      const t = computeQuickTotals(lines, coupons);
      const items = lines
        .filter((l) => l.qty > 0)
        .map((l) => ({
          product_id: l.product_id,
          variant_id: l.variant_id,
          name: l.name,
          price: l.is_gift ? 0 : l.unit_price,
          quantity: l.qty,
          stock_consumption: l.stock_consumption,
          is_free_item: l.is_gift || undefined,
          notes: l.note,
        }));
      const paymentMethod: PaymentMethod = p.mode === 'cash' ? 'cash' : 'partial';
      const paymentAmount = p.mode === 'bl' ? 0 : p.mode === 'acompte' ? p.amount : t.net;
      const clientOrderId = generateId();
      const cart = { items, coupons, discount_amount: 0, notes };
      const customerName = p.customerName || client?.name || reseller.name;
      const customerPhone = p.customerPhone || client?.phone || '';
      const address = deliveryAddress || reseller.address || undefined;

      try {
        const order = await createOrder({
          business_id: business.id,
          cashier_id: user.id,
          client_order_id: clientOrderId,
          cart,
          payment_method: paymentMethod,
          payment_amount: paymentAmount,
          tax_rate: 0,
          tax_inclusive: false,
          coupons,
          notes,
          customer_name: customerName,
          customer_phone: customerPhone || undefined,
          reseller_id: reseller.id,
          reseller_client_id: clientId ?? undefined,
          order_channel: 'livraison',
          delivery_address: address,
        });

        printHtml(
          generateDistributeurInvoice(
            buildInvoiceOrder(order, p, customerName, customerPhone),
            business,
            p.mode === 'bl' ? 'BON DE FACTURE' : 'FACTURE',
            {
              resellerName: reseller.name,
              resellerClientName: client?.name,
              resellerClientPhone: client?.phone ?? undefined,
            },
          ),
        );

        success(
          p.mode === 'bl'
            ? 'Bon de livraison créé'
            : p.mode === 'acompte'
              ? 'Acompte enregistré'
              : 'Commande encaissée',
        );
        clear();
        setFinalizeMode(null);
      } catch (err) {
        if (!isNetworkError(err)) {
          setFinalizeError(orderErrorMessage(err));
          return;
        }
        const dbPayload = buildOrderDbPayload({
          businessId: business.id,
          cashierId: user.id,
          clientOrderId,
          cart,
          paymentMethod,
          paymentAmount,
          taxRate: 0,
          taxInclusive: false,
          notes,
          resellerId: reseller.id,
          resellerClientId: clientId ?? null,
        });
        Object.assign(dbPayload, {
          customer_name: customerName,
          customer_phone: customerPhone || null,
          order_channel: 'livraison',
          delivery_address: address ?? null,
        });
        await enqueueToSync('create_order', dbPayload);
        warning('Hors ligne — commande enregistrée, synchronisation à la reconnexion.');
        clear();
        setFinalizeMode(null);
      } finally {
        setSubmitting(false);
      }
    },
    [
      business, user, reseller, clients, clientId, lines, coupons, notes, deliveryAddress,
      hasOverStock, buildInvoiceOrder, success, warning, clear,
    ],
  );

  if (!business) return null;
  if (!hasFeature(business, 'revendeurs') || !can('view_commande_rapide')) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-center text-sm text-content-muted">
        La commande rapide nécessite la fonctionnalité Revendeurs.
      </div>
    );
  }

  const selectedClient = clients.find((c) => c.id === clientId) ?? null;

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-surface-border">
        <h1 className="text-lg font-bold text-content-primary">Commande rapide</h1>
        <p className="text-xs text-content-secondary">
          Saisie en grille pour vos revendeurs — bon de livraison, encaissement ou acompte.
        </p>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <ResellerRail
          resellers={resellers}
          selectedId={activeResellerId}
          onSelect={(r) => setReseller(r.id, r.address ?? '')}
          loading={loading}
          draftResellerIds={Object.keys(draftsByReseller)}
        />

        {reseller ? (
          <>
            <OrderGrid products={productInputs} currency={currency} />
            <OrderSummary
              reseller={reseller}
              clients={clients}
              business={business}
              currency={currency}
              hasCashSession={!!cashSession}
              hasOverStock={hasOverStock}
              canRecall
              recalling={recalling}
              onRecall={handleRecall}
              onFinalize={setFinalizeMode}
              onCouponAdd={handleCouponAdd}
              onCouponRemove={handleCouponRemove}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-content-muted text-sm">
            Choisissez un revendeur pour commencer.
          </div>
        )}
      </div>

      {finalizeMode && reseller && (
        <FinalizeDialog
          mode={finalizeMode}
          total={totals.net}
          currency={currency}
          defaultName={selectedClient?.name || reseller.name}
          defaultPhone={selectedClient?.phone || reseller.phone || ''}
          submitting={submitting}
          error={finalizeError}
          onCancel={() => { setFinalizeMode(null); setFinalizeError(null); }}
          onConfirm={doFinalize}
        />
      )}
    </div>
  );
}
