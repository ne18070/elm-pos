import { supabase } from './client';
import { logAction } from './logger';
import { q } from './q';
import { calculateDiscount } from '../pricing';
import type { Order, Cart, PaymentMethod, Coupon, Refund } from '../../types';

export interface CreateOrderInput {
  business_id: string;
  cashier_id: string;
  cart: Cart;
  payment_method: PaymentMethod;
  payment_amount: number;
  tax_rate: number;
  coupons?: Coupon[];
  notes?: string;
  /** Informations client (obligatoires pour les acomptes) */
  customer_name?: string;
  customer_phone?: string;
  hotel_reservation_id?: string;
  table_id?: string;
  /** Pour paiement partiel : liste détaillée des lignes de paiement */
  payments?: Array<{ method: string; amount: number }>;
}

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const coupons = input.coupons ?? input.cart.coupons ?? [];
  const subtotal = input.cart.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  const discount = coupons.length > 0
    ? calculateDiscount(coupons, subtotal)
    : input.cart.discount_amount;
  const taxable = subtotal - discount;
  const tax = Math.round(taxable * input.tax_rate) / 100;
  const total = taxable + tax;

  // Premier coupon (backward compat)
  const firstCoupon = coupons[0] ?? null;
  // Notes du premier coupon free_item
  const couponNotes = coupons.find((c) => c.type === 'free_item')?.free_item_label ?? null;

  const order = await q<Order>(supabase.rpc('create_order', {
    order_data: {
      business_id: input.business_id,
      cashier_id:  input.cashier_id,
      hotel_reservation_id: input.hotel_reservation_id ?? null,
      items: input.cart.items.map((item) => ({
        product_id:       item.product_id,
        variant_id:       item.variant_id ?? null,
        name:             item.name,
        price:            item.price,
        quantity:         item.quantity,
        discount_amount:  0,
        total:            item.price * item.quantity,
        notes:            item.notes ?? null,
        stock_consumption: item.stock_consumption ?? 1,
      })),
      payment: {
        method: input.payment_method,
        amount: input.payment_amount,
      },
      ...(input.payments ? { payments: input.payments } : {}),
      subtotal,
      tax_amount:      tax,
      discount_amount: discount,
      total,
      coupon_id:      firstCoupon?.id   ?? null,
      coupon_code:    firstCoupon?.code ?? null,
      coupon_notes:   couponNotes,
      coupon_ids:     coupons.map((c) => c.id),
      coupon_codes:   coupons.map((c) => c.code),
      notes:          input.notes          ?? null,
      customer_name:  input.customer_name  ?? null,
      customer_phone: input.customer_phone ?? null,
      table_id:       input.table_id       ?? null,
    },
  }) as never);

  logAction({
    business_id: input.business_id,
    action:      'order.created',
    entity_type: 'order',
    entity_id:   order.id,
    user_id:     input.cashier_id,
    metadata: {
      total:          order.total,
      items_count:    input.cart.items.length,
      payment_method: input.payment_method,
    },
  });
  return order;
}

export async function getOrders(
  businessId: string,
  options?: { status?: string; limit?: number; offset?: number; date?: string }
): Promise<{ orders: Order[]; count: number }> {
  let query = supabase
    .from('orders')
    .select(
      `*, items:order_items(*), payments(*), cashier:cashier_id(id, full_name, email)`,
      { count: 'exact' }
    )
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  if (options?.status && options.status !== 'all') {
    query = query.eq('status', options.status);
  }
  if (options?.date) {
    query = query
      .gte('created_at', `${options.date}T00:00:00Z`)
      .lte('created_at', `${options.date}T23:59:59Z`);
  }
  if (options?.limit) query = query.limit(options.limit);
  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit ?? 20) - 1);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { orders: data as unknown as Order[], count: count ?? 0 };
}

export async function getOrderById(id: string): Promise<Order> {
  return q<Order>(
    supabase
      .from('orders')
      .select(`*, items:order_items(*), payments(*), cashier:cashier_id(id, full_name, email)`)
      .eq('id', id)
      .single() as never,
  );
}

// ─── Annulation (restaure stock + coupon en transaction) ─────────────────────

export async function cancelOrder(orderId: string): Promise<void> {
  await q(supabase.rpc('cancel_order', { p_order_id: orderId }));
}

// ─── Remboursement ───────────────────────────────────────────────────────────

export interface RefundInput {
  orderId: string;
  amount: number;
  reason?: string;
  refundedBy?: string;
}

export async function refundOrder(input: RefundInput): Promise<void> {
  await q(supabase.rpc('refund_order', {
    p_order_id:    input.orderId,
    p_amount:      input.amount,
    p_reason:      input.reason ?? null,
    p_refunded_by: input.refundedBy ?? null,
  }));
}

export async function getRefundsForOrder(orderId: string): Promise<Refund[]> {
  return q<Refund[]>(
    supabase.from('refunds').select('*').eq('order_id', orderId).order('refunded_at', { ascending: false }),
  );
}

// ─── Livraison / Picking ─────────────────────────────────────────────────────

/**
 * Commandes payées en attente de livraison, avec barcode produit pour le scan.
 */
export async function getOrdersForDelivery(businessId: string): Promise<Order[]> {
  return q<Order[]>(
    supabase
      .from('orders')
      .select(`
        *,
        cashier:cashier_id(id, full_name),
        items:order_items(
          *,
          product:products(id, barcode, image_url)
        )
      `)
      .eq('business_id', businessId)
      .in('status', ['paid', 'pending'])
      .neq('delivery_status', 'delivered')
      .order('created_at', { ascending: true }) as never,
  );
}

export async function startOrderPicking(orderId: string): Promise<void> {
  await q(supabase.rpc('start_order_picking', { p_order_id: orderId }));
}

export async function confirmOrderDelivery(orderId: string, deliveredBy: string): Promise<void> {
  await q(supabase.rpc('confirm_order_delivery', {
    p_order_id:     orderId,
    p_delivered_by: deliveredBy,
  }));
}

// ─── Paiement complémentaire (solde acompte) ─────────────────────────────────

export interface CompletePaymentInput {
  orderId: string;
  method: string;
  amount: number;
}

export async function completeOrderPayment(input: CompletePaymentInput): Promise<void> {
  await q(supabase.rpc('complete_order_payment', {
    p_order_id: input.orderId,
    p_method:   input.method,
    p_amount:   input.amount,
  }));
}
