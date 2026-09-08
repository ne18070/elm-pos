import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartItem, Coupon, Product, ProductVariant, RestaurantTable } from '@pos-types';
import { calculateDiscount, isCouponEligible } from '../../services/pricing';

// --- Commande en attente -------------------------------------------------------

export interface HeldOrder {
  id: string;
  label: string;
  items: CartItem[];
  coupons: Coupon[];
  notes: string;
  heldAt: string;
  selectedClient?: { id: string; name: string; phone?: string | null } | null;
  selectedTable?: RestaurantTable | null;
  wholesaleCtx?: any | null; // Using any for WholesaleContext to avoid circular or complex imports here
}

// --- Résultat d'ajout au panier -----------------------------------------------

export interface AddItemResult {
  ok: boolean;
  reason?: string;
}

// --- Store --------------------------------------------------------------------

export type OrderChannel = 'salle' | 'emporter' | 'livraison';

interface CartState {
  items: CartItem[];
  coupons: Coupon[];
  notes: string;
  orderChannel: OrderChannel;
  deliveryAddress: string;
  selectedClient: { id: string; name: string; phone?: string | null } | null;
  selectedTable: RestaurantTable | null;
  wholesaleCtx: any | null;

  heldOrders: HeldOrder[];
  holdCurrentOrder: (label: string) => void;
  recallHeldOrder: (id: string) => void;
  discardHeldOrder: (id: string) => void;

  addItem: (product: Product, variant?: ProductVariant) => AddItemResult;
  /** Ajoute un article offert à prix 0 (coupon free_item). Vérifie quand même le stock.
   *  `note` : texte affiché sur la facture (p.ex. le prix unitaire réel).
   *  `stockConsumption` : unités de STOCK consommées par unité offerte (défaut 1 ;
   *  <1 quand on offre une sous-unité, p.ex. 1/24 pour une tablette d'un carton). */
  addFreeItem: (product: Product, quantity: number, note?: string, stockConsumption?: number) => AddItemResult;
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
  /**
   * Retire les coupons dont les conditions ne sont plus remplies après une
   * modification du panier (montant ou quantité repassé sous le minimum requis)
   * ainsi que leurs articles offerts. Retourne la liste des coupons retirés.
   * Les seuils sont évalués sur les articles PAYANTS (l'article offert ne
   * compte pas pour son propre déclenchement).
   */
  reconcileCoupons: () => Coupon[];
  setNotes:  (notes: string) => void;
  setOrderChannel: (channel: OrderChannel) => void;
  setDeliveryAddress: (address: string) => void;
  setSelectedClient: (client: { id: string; name: string; phone?: string | null } | null) => void;
  setSelectedTable: (table: RestaurantTable | null) => void;
  setWholesaleCtx: (ctx: any | null) => void;
  clear: () => void;
  /** Applique des prix de gros sur les items du panier (clé = product_id → nouveau prix) */
  applyPriceOverrides: (overrides: Record<string, number>) => void;
  /** Réinitialise les prix aux prix de détail originaux (product.price) */
  resetPriceOverrides: () => void;

  subtotal: () => number;
  discountAmount: () => number;
  taxAmount: (taxRate: number, taxInclusive?: boolean) => number;
  total: (taxRate: number, taxInclusive?: boolean) => number;
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

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
  items:           [],
  coupons:         [],
  notes:           '',
  orderChannel:    'salle',
  deliveryAddress: '',
  selectedClient:  null,
  selectedTable:   null,
  wholesaleCtx:    null,
  heldOrders:      [],

  // -- Mise en attente ----------------------------------------------------------

  holdCurrentOrder: (label) => {
    const { items, coupons, notes, selectedClient, selectedTable, wholesaleCtx } = get();
    if (items.length === 0) return;
    const held: HeldOrder = {
      id:     crypto.randomUUID(),
      label:  label.trim() || `Client ${get().heldOrders.length + 1}`,
      items:  [...items],
      coupons: [...coupons],
      notes,
      heldAt: new Date().toISOString(),
      selectedClient,
      selectedTable,
      wholesaleCtx,
    };
    set((state) => ({
      heldOrders: [...state.heldOrders, held],
      items: [], coupons: [], notes: '',
      selectedClient: null, selectedTable: null, wholesaleCtx: null,
    }));
  },

  recallHeldOrder: (id) => {
    const held = get().heldOrders.find((h) => h.id === id);
    if (!held) return;
    set((state) => ({
      items:      [...held.items],
      coupons:    [...held.coupons],
      notes:      held.notes,
      selectedClient: held.selectedClient ?? null,
      selectedTable:  held.selectedTable ?? null,
      wholesaleCtx:   held.wholesaleCtx ?? null,
      heldOrders: state.heldOrders.filter((h) => h.id !== id),
    }));
  },

  discardHeldOrder: (id) => {
    set((state) => ({ heldOrders: state.heldOrders.filter((h) => h.id !== id) }));
  },

  // -- Ajout avec vérification stock --------------------------------------------

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

  addFreeItem: (product, quantity, note, stockConsumption) => {
    const consumption = stockConsumption && stockConsumption > 0 ? stockConsumption : 1;
    const { items } = get();
    const consumedInCart = items
      .filter((i) => i.product_id === product.id)
      .reduce((s, i) => s + i.quantity * (i.stock_consumption ?? 1), 0);
    // `quantity` est exprimée dans l'unité offerte → convertir en unités de stock.
    const check = stockAvailable(product, consumedInCart, quantity * consumption);
    if (!check.ok) return check;

    set((state) => {
      // Si un article offert du même produit existe déjà, augmenter la quantité
      const existing = state.items.find((i) => i.product_id === product.id && i.is_free_item);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.product_id === product.id && i.is_free_item
              ? { ...i, quantity: i.quantity + quantity, notes: note ?? i.notes }
              : i
          ),
        };
      }
      const newItem: import('@pos-types').CartItem = {
        product_id:   product.id,
        variant_id:   undefined,   // pas de variant_id → null en DB, pas de cast UUID
        name:         `${product.name} (offert)`,
        // Prix nul pour les totaux ; le prix unitaire réel est porté par
        // `product` (affichage panier) et par `notes` (affichage facture).
        price:        0,
        quantity,
        product,
        is_free_item: true,
        notes:        note,
      };
      if (consumption !== 1) newItem.stock_consumption = consumption;
      return { items: [...state.items, newItem] };
    });
    return { ok: true };
  },

  removeFreeItem: (productId) => {
    set((state) => ({
      items: state.items.filter((i) => !(i.product_id === productId && i.is_free_item)),
    }));
  },

  // -- Changement de quantité avec vérification stock ---------------------------

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

  // -- Sync stock Realtime → met à jour le produit dans les lignes du panier ---

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

  reconcileCoupons: () => {
    const { coupons, items } = get();
    if (coupons.length === 0) return [];

    // Seuils évalués sur les articles payants uniquement.
    const paid  = items.filter((i) => !i.is_free_item);
    const sub   = paid.reduce((s, i) => s + i.price * i.quantity, 0);
    const count = paid.reduce((n, i) => n + i.quantity, 0);

    const kept: Coupon[]    = [];
    const dropped: Coupon[] = [];
    for (const c of coupons) {
      (isCouponEligible(c, sub, count) ? kept : dropped).push(c);
    }
    if (dropped.length === 0) return [];

    const freeProductIds = new Set(
      dropped
        .filter((c) => c.type === 'free_item' && c.free_item_product_id)
        .map((c) => c.free_item_product_id as string),
    );

    set((state) => ({
      coupons: kept,
      items: freeProductIds.size
        ? state.items.filter((i) => !(i.is_free_item && freeProductIds.has(i.product_id)))
        : state.items,
    }));

    return dropped;
  },

  setNotes:           (notes)           => set({ notes }),
  setOrderChannel:    (orderChannel)    => set({ orderChannel }),
  setDeliveryAddress: (deliveryAddress) => set({ deliveryAddress }),
  setSelectedClient:  (selectedClient)  => set({ selectedClient }),
  setSelectedTable:   (selectedTable)   => set({ selectedTable }),
  setWholesaleCtx:    (wholesaleCtx)    => set({ wholesaleCtx }),
  clear: () => set({ items: [], coupons: [], notes: '', orderChannel: 'salle', deliveryAddress: '', selectedClient: null, selectedTable: null, wholesaleCtx: null }),

  applyPriceOverrides: (overrides) => set((state) => ({
    items: state.items.map((item) =>
      overrides[item.product_id] !== undefined
        ? { ...item, price: overrides[item.product_id] }
        : item
    ),
  })),

  resetPriceOverrides: () => set((state) => ({
    items: state.items.map((item) => ({
      ...item,
      price: item.product?.price ?? item.price,
    })),
  })),

  subtotal: () =>
    get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),

  discountAmount: () => {
    const { coupons, items } = get();
    const sub = items.reduce((s, i) => s + i.price * i.quantity, 0);
    const count = items.reduce((n, i) => n + i.quantity, 0);
    return calculateDiscount(coupons, sub, count);
  },

  taxAmount: (taxRate: number, taxInclusive = false) => {
    const s = get();
    const taxable = s.subtotal() - s.discountAmount();
    if (taxInclusive) return taxRate > 0 ? Math.round(taxable * taxRate / (100 + taxRate) * 100) / 100 : 0;
    return Math.round(taxable * taxRate) / 100;
  },

  total: (taxRate: number, taxInclusive = false) => {
    const s = get();
    if (taxInclusive) return s.subtotal() - s.discountAmount();
    return s.subtotal() - s.discountAmount() + s.taxAmount(taxRate);
  },

  itemCount: () =>
    get().items.reduce((sum, i) => sum + i.quantity, 0),
    }),
    {
      name: 'elm-pos-cart',
      // Persister uniquement les données sérialisables — pas les fonctions
      partialize: (state) => ({
        items:           state.items,
        coupons:         state.coupons,
        notes:           state.notes,
        orderChannel:    state.orderChannel,
        deliveryAddress: state.deliveryAddress,
        heldOrders:      state.heldOrders,
        selectedClient:  state.selectedClient,
        selectedTable:   state.selectedTable,
        wholesaleCtx:    state.wholesaleCtx,
      }),
    }
  )
);

