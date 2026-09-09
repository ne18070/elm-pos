import { supabase } from './client';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { logAction } from './logger';
import { q } from './q';
import { calculateDiscount, isCouponEligible } from '../pricing';
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
  /** UUID généré par le client AVANT l'appel — rend un rejeu (file offline,
   *  double clic, réponse réseau perdue) idempotent côté `create_order`. */
  client_order_id?: string;
  /** Rachat de points fidélité — débité DANS `create_order`, même transaction
   *  que la commande (l'ancien flux débitait après coup, hors transaction). */
  loyalty_redeem?: {
    client_name: string;
    client_phone?: string | null;
    points: number;      // points à débiter (= remise appliquée / valeur du point)
    cash_value: number;  // montant de la remise fidélité portée par la commande
  } | null;
}

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const rawCoupons = input.coupons ?? input.cart.coupons ?? [];
  const subtotal = input.cart.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  const itemCount = input.cart.items.reduce((n, item) => n + item.quantity, 0);
  // On n'envoie au serveur que les coupons encore éligibles (le panier a pu
  // rétrécir sous le minimum requis depuis l'application du code). `create_order`
  // revalide de son côté et rejetterait la commande sinon.
  const coupons = rawCoupons.filter((c) => isCouponEligible(c, subtotal, itemCount));
  const discount = coupons.length > 0
    ? calculateDiscount(coupons, subtotal, itemCount)
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
      client_order_id: input.client_order_id ?? null,
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
      loyalty_redeem: input.loyalty_redeem ?? null,
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
 *  le `#` de tête (l'ID est affiché "#A1B2C3D4" mais absent de la valeur uuid),
 *  la liste COMPLÈTE des caractères réservés de la grammaire de filtre
 *  PostgREST — `,` `.` `:` `*` `(` `)` `"` (non entourés de guillemets ici,
 *  donc à neutraliser plutôt qu'à échapper — cf. doc PostgREST "Reserved
 *  Characters") — et échappe les métacaractères ILIKE (%, _, \) pour que le
 *  terme soit matché littéralement. Toute recherche non nettoyée par cette
 *  fonction (id/customer_name/customer_phone dans getOrders) fait échouer
 *  .or() côté PostgREST (PGRST100) dès qu'un caractère réservé est présent —
 *  ex. un numéro de téléphone formaté "05.12.34.56.78" — et ce, sur TOUS les
 *  onglets de la page Commandes puisque la barre de recherche est partagée
 *  entre onglets (le filtre `search` s'applique quel que soit `tab`). */
function toIlikeTerm(raw: string): string {
  return raw.trim().replace(/^#+/, '').replace(/[,().:*"]/g, ' ').replace(/[\\%_]/g, (c) => '\\' + c);
}

// Jointures complètes, y compris le SKU produit de chaque ligne (facture
// distributeur). Le sous-select `products` par ligne de commande est coûteux :
// à réserver aux petits lots (une page de 50).
const ORDERS_FULL_SELECT =
  `*, items:order_items(*, product:products(sku)), payments(*), cashier:cashier_id(id, full_name, email), reseller:resellers!reseller_id(id, name, type), reseller_client:reseller_clients!reseller_client_id(id, name, phone)`;
// Projection LISTE : uniquement ce qu'affichent la liste des commandes et le
// rapport d'historique imprimé. Pas de `*` (on évite de transférer notes,
// delivery_*, coupon_ids/codes jsonb…), et les sous-selects réduits au strict
// nécessaire — `order_items(quantity)` (somme d'articles) et `payments(amount,
// method)` (versé / acompte) au lieu de `(*)`. Le détail d'une commande et la
// facture rechargent la version complète via getOrderById.
const ORDERS_LIST_COLS =
  'id, business_id, cashier_id, status, source, total, subtotal, tax_amount, ' +
  'discount_amount, amount_paid, balance_due, customer_name, customer_phone, ' +
  'reseller_id, reseller_client_id, order_channel, created_at, updated_at';
const ORDERS_LIST_SELECT =
  `${ORDERS_LIST_COLS}, items:order_items(quantity), payments(amount, method), cashier:cashier_id(id, full_name, email), reseller:resellers!reseller_id(id, name, type), reseller_client:reseller_clients!reseller_client_id(id, name, phone)`;

const ORDERS_SELECT: Record<'full' | 'list', string> = {
  full: ORDERS_FULL_SELECT,
  list: ORDERS_LIST_SELECT,
};

/** Curseur keyset : position de la dernière ligne d'une page dans l'ordre
 *  `created_at DESC, id DESC`. La page suivante = les lignes strictement
 *  après ce point. */
export interface OrderCursor { created_at: string; id: string }

export async function getOrders(
  businessId: string,
  options?: {
    status?:   string;
    limit?:    number;
    /** Pagination keyset : ne renvoie que les lignes situées APRÈS ce curseur
     *  (voir OrderCursor). Omis = première page. Pas d'`offset` : voir le
     *  commentaire dans le corps de la fonction. */
    before?:   OrderCursor;
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
    /** Acomptes uniquement : solde restant dû > 0, hors annulées/remboursées et
     *  hors demandes WhatsApp. Filtré et paginé côté SQL via la colonne générée
     *  `orders.balance_due` + l'index partiel `idx_orders_acompte` (migration
     *  112) — aucun filtrage ni pagination en mémoire côté client. */
    acompteOnly?: boolean;
    /** Demander un count. Par défaut true ; passer false quand seule la page
     *  compte. N'est de toute façon honoré que pour la 1re page (sans
     *  curseur) — voir le commentaire dans le corps de la fonction. `count`
     *  vaut alors `null` dans le résultat. */
    withCount?: boolean;
    /** 'full' (défaut) : toutes les jointures + SKU produit. 'list' : idem sans
     *  la jointure produit (gros lots, export). */
    projection?: 'full' | 'list';
  }
): Promise<{ orders: Order[]; count: number | null; hasMore: boolean; nextCursor: OrderCursor | null }> {
  const selectStr = ORDERS_SELECT[options?.projection ?? 'full'];
  const term   = toIlikeTerm(options?.search ?? '');
  const limit  = options?.limit ?? 0;
  const before = options?.before;

  // PAGINATION KEYSET, pas d'OFFSET. Avec `OFFSET n`, Postgres doit produire
  // n + limit lignes pour en jeter n : en recherche, il remonte l'index
  // (business_id, created_at DESC) en filtrant chaque ligne par ILIKE jusqu'à
  // réunir n + limit correspondances — coût croissant avec la profondeur,
  // statement_timeout (57014) dès la page 4 sur un terme courant (« amadou »)
  // dans un gros historique. Avec un curseur, chaque page ne parcourt que ce
  // qui suit la dernière ligne de la précédente : coût constant quelle que
  // soit la page.
  //   • `created_at <= c` seul est utilisable comme borne d'index (le parcours
  //     démarre au curseur) ; le `or` gère l'égalité stricte sur
  //     (created_at, id) — indispensable, des commandes importées partagent le
  //     même created_at.
  //   • Tri `created_at DESC, id DESC` : ordre total déterministe.
  //
  // COUNT — demandé UNIQUEMENT pour la première page. PostgREST ne renvoie
  // 416 / PGRST103 « Requested range not satisfiable » QUE lorsqu'un total lui
  // est demandé (Prefer: count=…) ET que la plage le dépasse — et avec
  // 'planned' / 'estimated' ce total est une ESTIMATION du planificateur,
  // parfois très inférieure au réel (recherche trigram « amadou » estimée à
  // 2 lignes alors que la 1re page en rapportait 51). Une page suivante ne
  // porte donc jamais de count ; le total ne change pas d'une page à l'autre,
  // le hook conserve celui de la 1re page.
  //  • 'estimated' hors recherche : exact tant que le planificateur estime peu
  //    de lignes, sinon estimation — jamais de COUNT(*) exact sur tout
  //    l'historique de l'onglet « Toutes ».
  //  • 'planned' en recherche : un simple EXPLAIN. Un count exact sur un terme
  //    courant (des milliers de factures) dépasse le statement_timeout.
  const withCount = (options?.withCount ?? true) && !before;
  const countMode: 'estimated' | 'planned' = term ? 'planned' : 'estimated';

  let query = supabase
    .from('orders')
    .select(selectStr, withCount ? { count: countMode } : undefined)
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (options?.status && options.status !== 'all') query = query.eq('status', options.status);
  if (options?.cashierId)    query = query.eq('cashier_id', options.cashierId);
  if (options?.createdAfter) query = query.gte('created_at', options.createdAfter);
  if (options?.acompteOnly) {
    // Acompte = solde restant dû. `balance_due` (colonne générée = total -
    // amount_paid, migration 112). 0.005 = même tolérance que l'affichage.
    // WhatsApp exclu : demandes non encaissées, pas des acomptes.
    query = query
      .gt('balance_due', 0.005)
      .not('status', 'in', '(cancelled,refunded)')
      .neq('source', 'whatsapp');
  }
  // `date`/`dateFrom`/`dateTo` : dates calendaires locales converties en bornes
  // UTC via un Date local (un `${date}T00:00:00Z` décalerait la fenêtre de
  // l'offset du fuseau).
  if (options?.date) {
    query = query
      .gte('created_at', new Date(`${options.date}T00:00:00`).toISOString())
      .lte('created_at', new Date(`${options.date}T23:59:59.999`).toISOString());
  } else {
    if (options?.dateFrom) query = query.gte('created_at', new Date(`${options.dateFrom}T00:00:00`).toISOString());
    if (options?.dateTo)   query = query.lte('created_at', new Date(`${options.dateTo}T23:59:59.999`).toISOString());
  }
  if (term) {
    // id_text (colonne générée, migration 097) : cast uuid→text inline rejeté
    // dans la grammaire or=(...), d'où la colonne dédiée. Index trigram GIN sur
    // id_text / customer_name / customer_phone (migration 122).
    query = query.or(`id_text.ilike.%${term}%,customer_name.ilike.%${term}%,customer_phone.ilike.%${term}%`);
  }
  if (before) {
    // Valeurs entre guillemets : `:` `+` `.` sont réservés dans la grammaire
    // or=(...) de PostgREST. Le second `or=` s'ajoute (AND) au premier.
    query = query
      .lte('created_at', before.created_at)
      .or(`created_at.lt."${before.created_at}",and(created_at.eq."${before.created_at}",id.lt."${before.id}")`);
  }
  // limit + 1 lignes : la ligne de trop sert à détecter la page suivante
  // (`hasMore`) sans count.
  if (limit) query = query.limit(limit + 1);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const rows    = (data ?? []) as unknown as Order[];
  const hasMore = limit > 0 && rows.length > limit;
  const page    = hasMore ? rows.slice(0, limit) : rows;
  const last    = page[page.length - 1];
  return {
    orders:     page,
    count:      withCount ? (count ?? 0) : null,
    hasMore,
    nextCursor: hasMore && last ? { created_at: last.created_at, id: last.id } : null,
  };
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
  /** Remplace la remise de la commande (0 pour la retirer). Omis = inchangée. */
  discount_amount?: number;
  /** Détache le coupon appliqué (code, notes, compteur d'utilisation libéré). */
  remove_coupon?: boolean;
}

export async function updatePendingOrder(orderId: string, input: UpdatePendingOrderInput): Promise<Order> {
  return q<Order>(supabase.rpc('update_pending_order', {
    p_order_id:        orderId,
    p_items:           input.items as never,
    p_tax_rate:        input.tax_rate,
    p_tax_inclusive:   input.tax_inclusive ?? false,
    p_customer_name:   input.customer_name  ?? undefined,
    p_customer_phone:  input.customer_phone ?? undefined,
    p_notes:           input.notes          ?? undefined,
    p_discount_amount: input.discount_amount ?? undefined,
    p_remove_coupon:   input.remove_coupon    ?? false,
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

export interface OverdueAcompte {
  id:             string;
  created_at:     string;
  balance_due:    number;
  total:          number;
  customer_name:  string | null;
  customer_phone: string | null;
  reseller_id:    string | null;
  days_old:       number;
  /** Comment le rapprochement a été fait : 'reseller' | 'reseller_client' | 'phone' | 'name'. */
  matched_on:     'reseller' | 'reseller_client' | 'phone' | 'name';
}

/**
 * Le plus ancien acompte impayé rattaché à cette partie (client rapproché par
 * téléphone puis par nom exact ; revendeur / client de revendeur rapproché par
 * id), créé il y a plus de `days` jours. Passe par la RPC SECURITY DEFINER
 * `overdue_acompte_for_customer` (migrations 114-115) pour voir aussi les
 * acomptes pris par un autre caissier. Renvoie `null` si aucun.
 */
export async function findOverdueAcompte(
  businessId: string,
  party: {
    name?: string | null;
    phone?: string | null;
    resellerId?: string | null;
    resellerClientId?: string | null;
  },
  days = 7,
): Promise<OverdueAcompte | null> {
  const name             = (party.name  ?? '').trim();
  const phone            = (party.phone ?? '').trim();
  const resellerId       = party.resellerId       ?? undefined;
  const resellerClientId = party.resellerClientId ?? undefined;
  if (!name && !phone && !resellerId && !resellerClientId) return null;

  const { data, error } = await supabase.rpc('overdue_acompte_for_customer' as never, {
    p_business_id:        businessId,
    p_name:              name  || undefined,
    p_phone:             phone || undefined,
    p_reseller_id:        resellerId,
    p_reseller_client_id: resellerClientId,
    p_days:              days,
  } as never);
  if (error) throw new Error((error as { message?: string }).message ?? 'Erreur lors de la vérification des acomptes');
  const rows = (data ?? []) as unknown as OverdueAcompte[];
  return rows[0] ?? null;
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
