'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Coupon } from '@pos-types';
import { isCouponEligible } from '../../services/pricing';

/**
 * État de l'écran « Commande rapide » (distributeur → revendeurs).
 *
 * Volontairement SÉPARÉ de `useCartStore` : le POS garde son panier intact,
 * ici on a une grille de saisie multi-lignes et un brouillon par revendeur.
 *
 * Coupons & remises : MÊMES RÈGLES que le POS — la remise vient uniquement des
 * coupons (`calculateDiscount`), les coupons inéligibles sont retirés à chaque
 * changement de commande (`reconcileCoupons`), un coupon « article offert »
 * ajoute une ligne à 0 (`is_gift`).
 */

export interface QuickVariant {
  id: string;
  name: string;
  price_modifier: number;
  sku?: string | null;
  /** Unités de stock de base consommées par unité vendue (défaut 1). */
  stock_consumption?: number;
}

export interface QuickLine {
  id: string;
  product_id: string;
  /** Variante choisie (produits à variantes) — pilote P.U initial + SKU + conso stock. */
  variant_id?: string;
  name: string;
  /** Référence article (SKU) — colonne « Réf. » de la facture distributeur. */
  sku: string | null;
  unit: string | null;
  qty: number;
  /** Prix unitaire facturé — pré-rempli au prix de gros, éditable ligne à ligne. */
  unit_price: number;
  /** Prix détail, affiché barré en référence. */
  detail_price: number;
  /** Unités de stock consommées par unité vendue (variante). Absent = 1. */
  stock_consumption?: number;
  /** Ligne « article offert » issue d'un coupon free_item (facturée 0). */
  is_gift?: boolean;
  /** Texte affiché sur la facture pour une ligne offerte. */
  note?: string;
}

export interface QuickProductInput {
  id: string;
  name: string;
  sku?: string | null;
  unit?: string | null;
  price: number;
  wholesale_price?: number | null;
  track_stock?: boolean;
  stock?: number;
  variants?: QuickVariant[];
}

/** Brouillon complet mémorisé par revendeur (restauré au retour sur ce revendeur). */
export interface QuickDraft {
  lines: QuickLine[];
  clientId: string | null;
  notes: string;
  deliveryAddress: string;
  coupons: Coupon[];
}

interface QuickOrderState {
  activeResellerId: string | null;
  clientId: string | null;
  notes: string;
  deliveryAddress: string;
  lines: QuickLine[];
  coupons: Coupon[];
  draftsByReseller: Record<string, QuickDraft>;

  setReseller: (id: string | null, defaultAddress?: string) => void;
  setClient: (id: string | null) => void;
  setNotes: (v: string) => void;
  setDeliveryAddress: (v: string) => void;

  addCoupon: (c: Coupon) => void;
  removeCoupon: (id: string) => void;
  /** Retire les coupons dont le seuil (montant / quantité) n'est plus atteint,
   *  ainsi que leurs lignes offertes. Renvoie les coupons retirés. */
  reconcileCoupons: () => Coupon[];

  addProduct: (p: QuickProductInput, variant?: QuickVariant) => void;
  addGiftLine: (p: QuickProductInput, qty: number, note?: string, consumption?: number) => void;
  removeGiftLine: (productId: string) => void;
  setQty: (id: string, qty: number) => void;
  setUnitPrice: (id: string, price: number) => void;
  removeLine: (id: string) => void;
  /** Charge un jeu de lignes complet — « Reprendre la dernière commande ». */
  replaceLines: (lines: QuickLine[]) => void;
  clear: () => void;
}

const uid = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `l_${Date.now()}_${Math.random().toString(36).slice(2)}`);

export const useQuickOrderStore = create<QuickOrderState>()(
  persist(
    (set, get) => ({
      activeResellerId: null,
      clientId: null,
      notes: '',
      deliveryAddress: '',
      lines: [],
      coupons: [],
      draftsByReseller: {},

      setReseller: (id, defaultAddress) => {
        const s = get();
        if (id === s.activeResellerId) return;

        // Sauvegarde du brouillon complet du revendeur qu'on quitte — mais
        // seulement s'il a au moins une ligne (sinon le point « brouillon » du
        // rail serait faux : l'adresse est pré-remplie à la sélection).
        const drafts = { ...s.draftsByReseller };
        if (s.activeResellerId) {
          if (s.lines.length > 0) {
            drafts[s.activeResellerId] = {
              lines: s.lines,
              clientId: s.clientId,
              notes: s.notes,
              deliveryAddress: s.deliveryAddress,
              coupons: s.coupons,
            };
          } else {
            delete drafts[s.activeResellerId];
          }
        }

        // …et restauration de celui du revendeur qu'on ouvre (ou état vierge).
        const restored = id ? drafts[id] : undefined;
        set({
          activeResellerId: id,
          draftsByReseller: drafts,
          lines: restored?.lines ?? [],
          clientId: restored?.clientId ?? null,
          notes: restored?.notes ?? '',
          coupons: restored?.coupons ?? [],
          deliveryAddress: restored?.deliveryAddress ?? (id ? (defaultAddress ?? '') : ''),
        });
      },

      setClient: (clientId) => set({ clientId }),
      setNotes: (notes) => set({ notes }),
      setDeliveryAddress: (deliveryAddress) => set({ deliveryAddress }),

      addCoupon: (c) =>
        set((s) => (s.coupons.some((x) => x.id === c.id) ? s : { coupons: [...s.coupons, c] })),

      removeCoupon: (id) =>
        set((s) => {
          const c = s.coupons.find((x) => x.id === id);
          const pid = c?.type === 'free_item' ? c.free_item_product_id : null;
          return {
            coupons: s.coupons.filter((x) => x.id !== id),
            lines: pid ? s.lines.filter((l) => !(l.is_gift && l.product_id === pid)) : s.lines,
          };
        }),

      reconcileCoupons: () => {
        const { coupons, lines } = get();
        if (coupons.length === 0) return [];

        const paid = lines.filter((l) => !l.is_gift);
        const sub = paid.reduce((s, l) => s + l.unit_price * l.qty, 0);
        const count = paid.reduce((n, l) => n + l.qty, 0);

        const kept: Coupon[] = [];
        const dropped: Coupon[] = [];
        for (const c of coupons) {
          (isCouponEligible(c, sub, count) ? kept : dropped).push(c);
        }
        if (dropped.length === 0) return [];

        const goneProductIds = new Set(
          dropped
            .filter((c) => c.type === 'free_item' && c.free_item_product_id)
            .map((c) => c.free_item_product_id as string),
        );
        set({
          coupons: kept,
          lines: goneProductIds.size
            ? lines.filter((l) => !(l.is_gift && goneProductIds.has(l.product_id)))
            : lines,
        });
        return dropped;
      },

      addProduct: (p, variant) => {
        set((s) => {
          const existing = s.lines.find(
            (l) => l.product_id === p.id && l.variant_id === variant?.id && !l.is_gift,
          );
          if (existing) {
            return {
              lines: s.lines.map((l) =>
                l.id === existing.id ? { ...l, qty: l.qty + 1 } : l,
              ),
            };
          }
          const mod = variant?.price_modifier ?? 0;
          const line: QuickLine = {
            id: uid(),
            product_id: p.id,
            variant_id: variant?.id,
            name: variant ? `${p.name} - ${variant.name}` : p.name,
            sku: variant?.sku ?? p.sku ?? null,
            unit: p.unit ?? null,
            qty: 1,
            unit_price: (p.wholesale_price ?? p.price ?? 0) + mod,
            detail_price: (p.price ?? 0) + mod,
            stock_consumption:
              variant?.stock_consumption && variant.stock_consumption !== 1
                ? variant.stock_consumption
                : undefined,
          };
          const firstGift = s.lines.findIndex((l) => l.is_gift);
          const next = [...s.lines];
          if (firstGift === -1) next.push(line);
          else next.splice(firstGift, 0, line);
          return { lines: next };
        });
      },

      addGiftLine: (p, qty, note, consumption) => {
        const sc = consumption && consumption !== 1 ? consumption : undefined;
        set((s) => {
          const existing = s.lines.find((l) => l.is_gift && l.product_id === p.id);
          if (existing) {
            return {
              lines: s.lines.map((l) =>
                l.id === existing.id ? { ...l, qty, note: note ?? l.note, stock_consumption: sc } : l,
              ),
            };
          }
          return {
            lines: [
              ...s.lines,
              {
                id: `gift:${p.id}`,
                product_id: p.id,
                name: `${p.name} (offert)`,
                sku: p.sku ?? null,
                unit: p.unit ?? null,
                qty,
                unit_price: 0,
                detail_price: p.price ?? 0,
                stock_consumption: sc,
                is_gift: true,
                note,
              },
            ],
          };
        });
      },

      removeGiftLine: (productId) =>
        set((s) => ({ lines: s.lines.filter((l) => !(l.is_gift && l.product_id === productId)) })),

      setQty: (id, qty) =>
        set((s) => ({
          lines: s.lines.map((l) => (l.id === id ? { ...l, qty: Math.max(0, qty) } : l)),
        })),

      setUnitPrice: (id, price) =>
        set((s) => ({
          lines: s.lines.map((l) => (l.id === id ? { ...l, unit_price: Math.max(0, price) } : l)),
        })),

      removeLine: (id) => set((s) => ({ lines: s.lines.filter((l) => l.id !== id) })),

      replaceLines: (lines) => set({ lines }),

      clear: () => {
        const { activeResellerId, draftsByReseller } = get();
        const drafts = { ...draftsByReseller };
        if (activeResellerId) delete drafts[activeResellerId];
        set({
          lines: [],
          draftsByReseller: drafts,
          clientId: null,
          notes: '',
          coupons: [],
          deliveryAddress: '',
        });
      },
    }),
    {
      name: 'elm-pos-quick-order',
      version: 1,
      // v0 : draftsByReseller était un Record<string, QuickLine[]>.
      // v1 : Record<string, QuickDraft>. On repart des brouillons legacy à vide
      // (les lignes seules ne valent pas une migration ; pas de crash sans ça,
      // mais on évite de traîner une forme non conforme).
      migrate: (persisted, from) => {
        const s = (persisted && typeof persisted === 'object' ? { ...persisted } : {}) as Record<string, unknown>;
        if (from < 1) s.draftsByReseller = {};
        return s as unknown as QuickOrderState;
      },
      partialize: (s) => ({
        activeResellerId: s.activeResellerId,
        clientId: s.clientId,
        notes: s.notes,
        deliveryAddress: s.deliveryAddress,
        lines: s.lines,
        coupons: s.coupons,
        draftsByReseller: s.draftsByReseller,
      }),
    },
  ),
);
