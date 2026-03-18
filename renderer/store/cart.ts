import { create } from 'zustand';
import type { CartItem, Coupon, Product, ProductVariant } from '@pos-types';

// ─── Commande en attente ───────────────────────────────────────────────────────

export interface HeldOrder {
  id: string;
  label: string;
  items: CartItem[];
  coupon: Coupon | null;
  notes: string;
  heldAt: string;
}

// ─── Résultat d'ajout au panier ───────────────────────────────────────────────

export interface AddItemResult {
  ok: boolean;
  reason?: string;
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface CartState {
  items: CartItem[];
  coupon: Coupon | null;
  notes: string;

  heldOrders: HeldOrder[];
  holdCurrentOrder: (label: string) => void;
  recallHeldOrder: (id: string) => void;
  discardHeldOrder: (id: string) => void;

  addItem: (product: Product, variant?: ProductVariant) => AddItemResult;
  removeItem: (productId: string, variantId?: string) => void;
  /**
   * Retourne false si la quantité demandée dépasse le stock disponible.
   * Le stock est lu depuis le produit stocké dans CartItem (mis à jour par Realtime).
   */
  updateQuantity: (productId: string, variantId: string | undefined, qty: number) => AddItemResult;
  removeItem: (productId: string, variantId?: string) => void;
  updateNotes: (productId: string, variantId: string | undefined, notes: string) => void;
  /** Met à jour le snapshot du produit dans les lignes du panier (appelé par le Realtime). */
  syncProductStock: (productId: string, newStock: number | undefined, isActive: boolean) => void;

  setCoupon: (coupon: Coupon | null) => void;
  setNotes:  (notes: string) => void;
  clear: () => void;

  subtotal: () => number;
  discountAmount: () => number;
  taxAmount: (taxRate: number) => number;
  total: (taxRate: number) => number;
  itemCount: () => number;
}

const itemKey = (productId: string, variantId?: string) =>
  variantId ? `${productId}::${variantId}` : productId;

function stockAvailable(product: Product, qtyInCart: number): AddItemResult {
  if (!product.track_stock) return { ok: true };
  const stock = product.stock ?? 0;
  if (qtyInCart >= stock) {
    return {
      ok: false,
      reason: stock === 0
        ? `"${product.name}" est épuisé`
        : `Stock insuffisant — seulement ${stock} disponible${stock > 1 ? 's' : ''}`,
    };
  }
  return { ok: true };
}

export const useCartStore = create<CartState>((set, get) => ({
  items:       [],
  coupon:      null,
  notes:       '',
  heldOrders:  [],

  // ── Mise en attente ──────────────────────────────────────────────────────────

  holdCurrentOrder: (label) => {
    const { items, coupon, notes } = get();
    if (items.length === 0) return;
    const held: HeldOrder = {
      id:     crypto.randomUUID(),
      label:  label.trim() || `Client ${get().heldOrders.length + 1}`,
      items:  [...items],
      coupon,
      notes,
      heldAt: new Date().toISOString(),
    };
    set((state) => ({
      heldOrders: [...state.heldOrders, held],
      items: [], coupon: null, notes: '',
    }));
  },

  recallHeldOrder: (id) => {
    const held = get().heldOrders.find((h) => h.id === id);
    if (!held) return;
    set((state) => ({
      items:      [...held.items],
      coupon:     held.coupon,
      notes:      held.notes,
      heldOrders: state.heldOrders.filter((h) => h.id !== id),
    }));
  },

  discardHeldOrder: (id) => {
    set((state) => ({ heldOrders: state.heldOrders.filter((h) => h.id !== id) }));
  },

  // ── Ajout avec vérification stock ────────────────────────────────────────────

  addItem: (product, variant) => {
    const key = itemKey(product.id, variant?.id);
    const { items } = get();
    const inCart = items.find((i) => itemKey(i.product_id, i.variant_id) === key)?.quantity ?? 0;

    const check = stockAvailable(product, inCart);
    if (!check.ok) return check;

    set((state) => {
      const existing = state.items.find((i) => itemKey(i.product_id, i.variant_id) === key);
      if (existing) {
        return {
          items: state.items.map((i) =>
            itemKey(i.product_id, i.variant_id) === key
              ? { ...i, quantity: i.quantity + 1 }
              : i
          ),
        };
      }
      const price = product.price + (variant?.price_modifier ?? 0);
      return {
        items: [
          ...state.items,
          {
            product_id: product.id,
            variant_id: variant?.id,
            name:       variant ? `${product.name} - ${variant.name}` : product.name,
            price,
            quantity:   1,
            product,
          },
        ],
      };
    });
    return { ok: true };
  },

  // ── Changement de quantité avec vérification stock ───────────────────────────

  updateQuantity: (productId, variantId, qty) => {
    const key = itemKey(productId, variantId);
    const item = get().items.find((i) => itemKey(i.product_id, i.variant_id) === key);

    if (qty <= 0) {
      set((state) => ({
        items: state.items.filter((i) => itemKey(i.product_id, i.variant_id) !== key),
      }));
      return { ok: true };
    }

    // Vérifier le stock si le produit est suivi
    if (item?.product?.track_stock) {
      const stock = item.product.stock ?? 0;
      if (qty > stock) {
        return {
          ok: false,
          reason: `Stock insuffisant — seulement ${stock} disponible${stock > 1 ? 's' : ''}`,
        };
      }
    }

    set((state) => ({
      items: state.items.map((i) =>
        itemKey(i.product_id, i.variant_id) === key ? { ...i, quantity: qty } : i
      ),
    }));
    return { ok: true };
  },

  // ── Sync stock Realtime → met à jour le produit dans les lignes du panier ───

  syncProductStock: (productId, newStock, isActive) => {
    set((state) => ({
      items: state.items.map((i) =>
        i.product_id === productId && i.product
          ? { ...i, product: { ...i.product, stock: newStock, is_active: isActive } }
          : i
      ),
    }));
  },

  removeItem: (productId, variantId) => {
    const key = itemKey(productId, variantId);
    set((state) => ({
      items: state.items.filter((i) => itemKey(i.product_id, i.variant_id) !== key),
    }));
  },

  updateNotes: (productId, variantId, notes) => {
    const key = itemKey(productId, variantId);
    set((state) => ({
      items: state.items.map((i) =>
        itemKey(i.product_id, i.variant_id) === key ? { ...i, notes } : i
      ),
    }));
  },

  setCoupon: (coupon) => set({ coupon }),
  setNotes:  (notes)  => set({ notes }),
  clear: () => set({ items: [], coupon: null, notes: '' }),

  subtotal: () =>
    get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),

  discountAmount: () => {
    const { coupon, items } = get();
    if (!coupon) return 0;
    const sub = items.reduce((s, i) => s + i.price * i.quantity, 0);
    return coupon.type === 'percentage'
      ? Math.round(sub * coupon.value / 100 * 100) / 100
      : Math.min(coupon.value, sub);
  },

  taxAmount: (taxRate: number) => {
    const s = get();
    return Math.round((s.subtotal() - s.discountAmount()) * taxRate) / 100;
  },

  total: (taxRate: number) => {
    const s = get();
    return s.subtotal() - s.discountAmount() + s.taxAmount(taxRate);
  },

  itemCount: () =>
    get().items.reduce((sum, i) => sum + i.quantity, 0),
}));
