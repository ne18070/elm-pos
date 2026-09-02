import { supabase } from './client';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  tax_inclusive?: boolean;
  coupons?: Coupon[];
  notes?: string;
  /** Informations client (obligatoires pour les acomptes) */
  customer_name?: string;
  customer_phone?: string;
  hotel_reservation_id?: string;
  table_id?: string;
  /** Vente de gros : revendeur lié et, optionnellement, son client */
  reseller_id?: string | null;
  reseller_client_id?: string | null;
  /** Pour paiement partiel : liste détaillée des lignes de paiement */
  payments?: Array<{ method: string; amount: number }>;
  order_channel?: 'salle' | 'emporter' | 'livraison';
  delivery_address?: string;
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
  let tax: number;
  let total: number;
  if (input.tax_inclusive) {
    tax   = input.tax_rate > 0 ? Math.round(taxable * input.tax_rate / (100 + input.tax_rate) * 100) / 100 : 0;
    total = taxable;
  } else {
    tax   = Math.round(taxable * input.tax_rate) / 100;
    total = taxable + tax;
  }

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
      notes:            input.notes            ?? null,
      customer_name:    input.customer_name    ?? null,
      customer_phone:   input.customer_phone   ?? null,
      table_id:         input.table_id         ?? null,
      reseller_id:        input.reseller_id        ?? null,
      reseller_client_id: input.reseller_client_id ?? null,
      order_channel:    input.order_channel    ?? 'salle',
      delivery_address: input.delivery_address ?? null,
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

/** Nettoie un terme de recherche pour un usage sûr dans .or()/.ilike() : retire
 *  les caractères structurants de .or() (virgule, parenthèses) et échappe les
 *  métacaractères ILIKE (%, _, \) pour que le terme soit matché littéralement. */
function toIlikeTerm(raw: string): string {
  return raw.trim().replace(/[,()]/g, ' ').replace(/[\\%_]/g, (c) => '\\' + c);
}

export async function getOrders(
  businessId: string,
  options?: {
    status?:   string;
    limit?:    number;
    offset?:   number;
    /** Un seul jour (YYYY-MM-DD) — ignoré si dateFrom/dateTo est fourni. */
    date?:     string;
    /** Plage de dates (YYYY-MM-DD, bornes incluses). */
    dateFrom?: string;
    dateTo?:   string;
    search?:   string;
    /** Restreint aux commandes encaissées par ce caissier (son user id). */
    cashierId?: string;
    /** Plancher absolu sur created_at (ISO) — cumulé avec date/dateFrom/dateTo,
     *  jamais élargi par l'utilisateur. Sert à borner la vue d'un caissier. */
    createdAfter?: string;
  }
): Promise<{ orders: Order[]; count: number }> {
  let query = supabase
    .from('orders')
    .select(
      `*, items:order_items(*, product:products(sku)), payments(*), cashier:cashier_id(id, full_name, email), reseller:resellers!reseller_id(id, name, type), reseller_client:reseller_clients!reseller_client_id(id, name, phone)`,
      { count: 'exact' }
    )
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  if (options?.status && options.status !== 'all') {
    query = query.eq('status', options.status);
  }
  if (options?.cashierId) {
    query = query.eq('cashier_id', options.cashierId);
  }
  if (options?.createdAfter) {
    query = query.gte('created_at', options.createdAfter);
  }
  if (options?.date) {
    query = query
      .gte('created_at', `${options.date}T00:00:00Z`)
      .lte('created_at', `${options.date}T23:59:59Z`);
  } else {
    if (options?.dateFrom) query = query.gte('created_at', `${options.dateFrom}T00:00:00Z`);
    if (options?.dateTo)   query = query.lte('created_at', `${options.dateTo}T23:59:59Z`);
  }

  const term = toIlikeTerm(options?.search ?? '');
  if (term) {
    // id_text (colonne générée, migration 097) : `id` est de type uuid — un
    // cast inline (`id::text.ilike...`) est rejeté par PostgREST à l'intérieur
    // de la grammaire or=(...) (PGRST100 "unexpected :"), d'où la colonne
    // texte dédiée plutôt qu'un cast à la volée. Ne couvre pas le nom du
    // caissier (table jointe) : le filtrer proprement demanderait une
    // jointure !inner dédiée.
    query = query.or(`id_text.ilike.%${term}%,customer_name.ilike.%${term}%,customer_phone.ilike.%${term}%`);
  }

  // .range() seul pour la pagination — ne jamais combiner avec .limit() sur
  // la même requête (l'un des deux écrase silencieusement l'effet de l'autre
  // selon l'ordre d'appel, cause du bug historique où offset=0 ignorait
  // totalement la pagination car `if (options?.offset)` traite 0 comme faux).
  if (options?.limit) {
    const offset = options.offset ?? 0;
    query = query.range(offset, offset + options.limit - 1);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { orders: (data ?? []) as unknown as Order[], count: count ?? 0 };
}

export async function getOrderById(id: string): Promise<Order> {
  return q<Order>(
    supabase
      .from('orders')
      .select(`*, items:order_items(*, product:products(sku)), payments(*), cashier:cashier_id(id, full_name, email), reseller:resellers!reseller_id(id, name, type), reseller_client:reseller_clients!reseller_client_id(id, name, phone)`)
      .eq('id', id)
      .single() as never,
  );
}

// ─── Annulation (restaure stock + coupon en transaction) ─────────────────────

export async function cancelOrder(orderId: string): Promise<void> {
  await q(supabase.rpc('cancel_order', { p_order_id: orderId }));
}

// ─── Édition d'une commande NON encaissée (pending, 0 paiement) ──────────────

export interface UpdatePendingOrderInput {
  items: Array<{
    product_id: string;
    variant_id?: string | null;
    name: string;
    price: number;
    quantity: number;
    notes?: string | null;
  }>;
  tax_rate: number;
  tax_inclusive?: boolean;
  customer_name?: string | null;
  customer_phone?: string | null;
  notes?: string | null;
}

export async function updatePendingOrder(orderId: string, input: UpdatePendingOrderInput): Promise<Order> {
  return q<Order>(supabase.rpc('update_pending_order', {
    p_order_id:       orderId,
    p_items:          input.items as never,
    p_tax_rate:       input.tax_rate,
    p_tax_inclusive:  input.tax_inclusive ?? false,
    p_customer_name:  input.customer_name  ?? undefined,
    p_customer_phone: input.customer_phone ?? undefined,
    p_notes:          input.notes          ?? undefined,
  }) as never);
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
    p_reason:      input.reason ?? undefined,
    p_refunded_by: input.refundedBy ?? undefined,
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
 *
 * `orders.delivery_status` vaut `'pending'` par défaut sur TOUTE commande (même
 * une vente comptoir sans rien à livrer) : sans bornes, `delivery_status <>
 * 'delivered'` sélectionne tout l'historique des ventes et la jointure
 * order_items+products fait dépasser le statement_timeout (erreur 57014).
 * On borne donc à une fenêtre récente + un plafond de lignes — une file de
 * picking n'a jamais besoin de plus. Index dédié : migration 099.
 */
export async function getOrdersForDelivery(
  businessId: string,
  opts?: { sinceDays?: number; limit?: number },
): Promise<Order[]> {
  const sinceDays = opts?.sinceDays ?? 60;
  const limit     = opts?.limit ?? 500;
  const since     = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
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
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(limit) as never,
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
