import { create } from 'zustand';
import type { CartItem, Coupon, Product, ProductVariant } from '@pos-types';

// ─── Commande en attente ───────────────────────────────────────────────────────

export interface HeldOrder {
  id: string;
  label: string;
  items: CartItem[];
  coupons: Coupon[];
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
  coupons: Coupon[];
  notes: string;

  heldOrders: HeldOrder[];
  holdCurrentOrder: (label: string) => void;
  recallHeldOrder: (id: string) => void;
  discardHeldOrder: (id: string) => void;

  addItem: (product: Product, variant?: ProductVariant) => AddItemResult;
  /** Ajoute un article offert à prix 0 (coupon free_item). Vérifie quand même le stock. */
  addFreeItem: (product: Product, quantity: number) => AddItemResult;
  /** Retire l'article offert (is_free_item) d'un produit donné */
  removeFreeItem: (productId: string) => void;
  removeItem: (productId: string, variantId?: string) => void;
  /**
   * Retourne false si la quantité demandée dépasse le stock disponible.
   * Le stock est lu depuis le produit stocké dans CartItem (mis à jour par Realtime).
   */
  updateQuantity: (productId: string, variantId: string | undefined, qty: number) => AddItemResult;
  updateNotes: (productId: string, variantId: string | undefined, notes: string) => void;
  /** Met à jour le snapshot du produit dans les lignes du panier (appelé par le Realtime). */
  syncProductStock: (productId: string, newStock: number | undefined, isActive: boolean) => void;

  addCoupon: (coupon: Coupon) => void;
  removeCoupon: (couponId: string) => void;
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

function stockAvailable(product: Product, consumedInCart: number, consumption: number): AddItemResult {
  if (!product.track_stock) return { ok: true };
  const stock = product.stock ?? 0;
  if (consumedInCart + consumption > stock) {
    return {
      ok: false,
      reason: stock === 0
        ? `"${product.name}" est épuisé`
        : `Stock insuffisant — seulement ${stock} ${product.unit ?? 'unité(s)'} disponible${stock > 1 ? 's' : ''}`,
    };
  }
  return { ok: true };
}

export const useCartStore = create<CartState>((set, get) => ({
  items:       [],
  coupons:     [],
  notes:       '',
  heldOrders:  [],

  // ── Mise en attente ──────────────────────────────────────────────────────────

  holdCurrentOrder: (label) => {
    const { items, coupons, notes } = get();
    if (items.length === 0) return;
    const held: HeldOrder = {
      id:     crypto.randomUUID(),
      label:  label.trim() || `Client ${get().heldOrders.length + 1}`,
      items:  [...items],
      coupons: [...coupons],
      notes,
      heldAt: new Date().toISOString(),
    };
    set((state) => ({
      heldOrders: [...state.heldOrders, held],
      items: [], coupons: [], notes: '',
    }));
  },

  recallHeldOrder: (id) => {
    const held = get().heldOrders.find((h) => h.id === id);
    if (!held) return;
    set((state) => ({
      items:      [...held.items],
      coupons:    [...held.coupons],
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
    const consumption = variant?.stock_consumption ?? 1;
    // Total base-units already consumed in cart for this product (across all variants)
    const consumedInCart = items
      .filter((i) => i.product_id === product.id)
      .reduce((s, i) => s + i.quantity * (i.stock_consumption ?? 1), 0);

    const check = stockAvailable(product, consumedInCart, consumption);
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
      const newItem: import('@pos-types').CartItem = {
        product_id: product.id,
        variant_id: variant?.id,
        name:       variant ? `${product.name} - ${variant.name}` : product.name,
        price,
        quantity:   1,
        product,
      };
      if (consumption !== 1) {
        newItem.stock_consumption = consumption;
      }
      return { items: [...state.items, newItem] };
    });
    return { ok: true };
  },

  addFreeItem: (product, quantity) => {
    const { items } = get();
    const consumedInCart = items
      .filter((i) => i.product_id === product.id)
      .reduce((s, i) => s + i.quantity * (i.stock_consumption ?? 1), 0);
    const check = stockAvailable(product, consumedInCart, quantity);
    if (!check.ok) return check;

    set((state) => {
      // Si un article offert du même produit existe déjà, augmenter la quantité
      const existing = state.items.find((i) => i.product_id === product.id && i.is_free_item);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.product_id === product.id && i.is_free_item
              ? { ...i, quantity: i.quantity + quantity }
              : i
          ),
        };
      }
      const newItem: import('@pos-types').CartItem = {
        product_id:   product.id,
        variant_id:   undefined,   // pas de variant_id → null en DB, pas de cast UUID
        name:         `${product.name} (offert)`,
        price:        0,
        quantity,
        product,
        is_free_item: true,
      };
      return { items: [...state.items, newItem] };
    });
    return { ok: true };
  },

  removeFreeItem: (productId) => {
    set((state) => ({
      items: state.items.filter((i) => !(i.product_id === productId && i.is_free_item)),
    }));
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
      const consumption = item.stock_consumption ?? 1;
      // Total consumed by all OTHER items of the same product
      const otherConsumed = get().items
        .filter((i) => i.product_id === item.product_id && itemKey(i.product_id, i.variant_id) !== key)
        .reduce((s, i) => s + i.quantity * (i.stock_consumption ?? 1), 0);
      if (qty * consumption + otherConsumed > stock) {
        return {
          ok: false,
          reason: `Stock insuffisant — seulement ${stock} ${item.product.unit ?? 'unité(s)'} disponible${stock > 1 ? 's' : ''}`,
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

  addCoupon: (coupon) => {
    set((state) => {
      // Éviter les doublons
      if (state.coupons.some((c) => c.id === coupon.id)) return state;
      return { coupons: [...state.coupons, coupon] };
    });
  },

  removeCoupon: (couponId) => {
    set((state) => ({ coupons: state.coupons.filter((c) => c.id !== couponId) }));
  },

  setNotes:  (notes)  => set({ notes }),
  clear: () => set({ items: [], coupons: [], notes: '' }),

  subtotal: () =>
    get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),

  discountAmount: () => {
    const { coupons, items } = get();
    if (coupons.length === 0) return 0;
    const sub = items.reduce((s, i) => s + i.price * i.quantity, 0);
    let total = 0;
    for (const coupon of coupons) {
      if (coupon.type === 'free_item') continue;
      total += coupon.type === 'percentage'
        ? Math.round(sub * coupon.value / 100 * 100) / 100
        : Math.min(coupon.value, sub);
    }
    return Math.min(total, sub);
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
