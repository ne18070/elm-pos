import { create } from 'zustand';
import type { CartItem, Coupon, Product, ProductVariant } from '@pos-types';

interface CartState {
  items: CartItem[];
  coupon: Coupon | null;
  notes: string;

  // Actions
  addItem: (product: Product, variant?: ProductVariant) => void;
  removeItem: (productId: string, variantId?: string) => void;
  updateQuantity: (productId: string, variantId: string | undefined, qty: number) => void;
  updateNotes: (productId: string, variantId: string | undefined, notes: string) => void;
  setCoupon: (coupon: Coupon | null) => void;
  setNotes: (notes: string) => void;
  clear: () => void;

  // Computed
  subtotal: () => number;
  discountAmount: (taxRate?: number) => number;
  taxAmount: (taxRate: number) => number;
  total: (taxRate: number) => number;
  itemCount: () => number;
}

const itemKey = (productId: string, variantId?: string) =>
  variantId ? `${productId}::${variantId}` : productId;

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  coupon: null,
  notes: '',

  addItem: (product, variant) => {
    const key = itemKey(product.id, variant?.id);
    set((state) => {
      const existing = state.items.find(
        (i) => itemKey(i.product_id, i.variant_id) === key
      );
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
            name: variant ? `${product.name} - ${variant.name}` : product.name,
            price,
            quantity: 1,
            product,
          },
        ],
      };
    });
  },

  removeItem: (productId, variantId) => {
    const key = itemKey(productId, variantId);
    set((state) => ({
      items: state.items.filter(
        (i) => itemKey(i.product_id, i.variant_id) !== key
      ),
    }));
  },

  updateQuantity: (productId, variantId, qty) => {
    const key = itemKey(productId, variantId);
    if (qty <= 0) {
      set((state) => ({
        items: state.items.filter(
          (i) => itemKey(i.product_id, i.variant_id) !== key
        ),
      }));
      return;
    }
    set((state) => ({
      items: state.items.map((i) =>
        itemKey(i.product_id, i.variant_id) === key ? { ...i, quantity: qty } : i
      ),
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
  setNotes: (notes) => set({ notes }),

  clear: () => set({ items: [], coupon: null, notes: '' }),

  subtotal: () =>
    get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),

  discountAmount: () => {
    const { coupon, items } = get();
    if (!coupon) return 0;
    const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    if (coupon.type === 'percentage') {
      return Math.round((subtotal * coupon.value) / 100 * 100) / 100;
    }
    return Math.min(coupon.value, subtotal);
  },

  taxAmount: (taxRate: number) => {
    const state = get();
    const subtotal = state.subtotal();
    const discount = state.discountAmount();
    return Math.round((subtotal - discount) * taxRate) / 100;
  },

  total: (taxRate: number) => {
    const state = get();
    const subtotal = state.subtotal();
    const discount = state.discountAmount();
    const tax = state.taxAmount(taxRate);
    return subtotal - discount + tax;
  },

  itemCount: () =>
    get().items.reduce((sum, i) => sum + i.quantity, 0),
}));
