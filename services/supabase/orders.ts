import { supabase } from './client';
import type { Order, Cart, PaymentMethod, Coupon } from '../../types';

export interface CreateOrderInput {
  business_id: string;
  cashier_id: string;
  cart: Cart;
  payment_method: PaymentMethod;
  payment_amount: number;
  tax_rate: number;
  coupon?: Coupon;
  notes?: string;
}

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const subtotal = input.cart.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  const discount = input.coupon
    ? calculateDiscount(input.coupon, subtotal)
    : input.cart.discount_amount;
  const taxable = subtotal - discount;
  const tax = Math.round(taxable * input.tax_rate) / 100;
  const total = taxable + tax;

  const { data, error } = await supabase.rpc('create_order', {
    order_data: {
      business_id: input.business_id,
      cashier_id: input.cashier_id,
      items: input.cart.items.map((item) => ({
        product_id: item.product_id,
        variant_id: item.variant_id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        discount_amount: 0,
        total: item.price * item.quantity,
        notes: item.notes,
      })),
      payment: {
        method: input.payment_method,
        amount: input.payment_amount,
      },
      subtotal,
      tax_amount: tax,
      discount_amount: discount,
      total,
      coupon_id: input.coupon?.id,
      coupon_code: input.coupon?.code,
      notes: input.notes,
    },
  });

  if (error) throw new Error(error.message);
  return data as Order;
}

export async function getOrders(
  businessId: string,
  options?: { status?: string; limit?: number; offset?: number; date?: string }
): Promise<{ orders: Order[]; count: number }> {
  let query = supabase
    .from('orders')
    .select(
      `
      *,
      items:order_items(*),
      payments(*),
      cashier:users(id, full_name, email)
    `,
      { count: 'exact' }
    )
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  if (options?.status) {
    query = query.eq('status', options.status);
  }

  if (options?.date) {
    const start = `${options.date}T00:00:00Z`;
    const end = `${options.date}T23:59:59Z`;
    query = query.gte('created_at', start).lte('created_at', end);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.range(
      options.offset,
      options.offset + (options.limit ?? 20) - 1
    );
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  return { orders: data as Order[], count: count ?? 0 };
}

export async function getOrderById(id: string): Promise<Order> {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      items:order_items(*),
      payments(*),
      cashier:users(id, full_name, email)
    `)
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data as Order;
}

export async function cancelOrder(id: string): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(error.message);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calculateDiscount(coupon: Coupon, subtotal: number): number {
  if (coupon.type === 'percentage') {
    return Math.round((subtotal * coupon.value) / 100 * 100) / 100;
  }
  return Math.min(coupon.value, subtotal);
}
