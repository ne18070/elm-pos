import { supabase } from './client';
import type { AnalyticsSummary, DailyStat, TopProduct } from '../../types';
import { format, subDays } from 'date-fns';

export async function getAnalyticsSummary(
  businessId: string,
  days = 30
): Promise<AnalyticsSummary> {
  const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd');

  const [ordersResult, itemsResult] = await Promise.all([
    // Orders summary
    supabase
      .from('orders')
      .select('total, created_at')
      .eq('business_id', businessId)
      .eq('status', 'paid')
      .gte('created_at', `${startDate}T00:00:00Z`),

    // Top products via order items
    supabase
      .from('order_items')
      .select(`
        product_id,
        name,
        quantity,
        total,
        order:orders!inner(business_id, status)
      `)
      .eq('order.business_id', businessId)
      .eq('order.status', 'paid')
      .gte('order.created_at' as never, `${startDate}T00:00:00Z`),
  ]);

  if (ordersResult.error) throw new Error(ordersResult.error.message);

  const orders = (ordersResult.data ?? []) as Array<{ total: number; created_at: string }>;
  const total_sales = orders.reduce((sum, o) => sum + o.total, 0);
  const order_count = orders.length;
  const avg_order_value = order_count > 0 ? total_sales / order_count : 0;

  // Build daily stats
  const dailyMap = new Map<string, DailyStat>();
  for (const order of orders) {
    const date = order.created_at.slice(0, 10);
    const existing = dailyMap.get(date) ?? {
      date,
      total_sales: 0,
      order_count: 0,
      avg_order_value: 0,
    };
    existing.total_sales += order.total;
    existing.order_count += 1;
    dailyMap.set(date, existing);
  }

  const daily_stats: DailyStat[] = Array.from(dailyMap.values())
    .map((s) => ({
      ...s,
      avg_order_value: s.order_count > 0 ? s.total_sales / s.order_count : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Build top products
  type ItemRow = { product_id: string; name: string; quantity: number; total: number };
  const productMap = new Map<string, TopProduct>();
  for (const item of (itemsResult.data ?? []) as ItemRow[]) {
    const existing = productMap.get(item.product_id) ?? {
      product_id: item.product_id,
      name: item.name,
      quantity_sold: 0,
      revenue: 0,
    };
    existing.quantity_sold += item.quantity;
    existing.revenue += item.total;
    productMap.set(item.product_id, existing);
  }

  const top_products = Array.from(productMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  return { total_sales, order_count, avg_order_value, top_products, daily_stats };
}

// ─── Reseller stats ──────────────────────────────────────────────────────────

export interface ResellerStat {
  reseller_id: string;
  name: string;
  revenue: number;
  order_count: number;
}

export interface ResellerClientStat {
  client_id: string;
  name: string;
  reseller_name: string;
  revenue: number;
  order_count: number;
}

export async function getResellerStats(
  businessId: string,
  days = 30
): Promise<ResellerStat[]> {
  const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd');

  const { data, error } = await supabase
    .from('orders')
    .select('total, reseller_id, reseller:resellers!reseller_id(name)')
    .eq('business_id', businessId)
    .eq('status', 'paid')
    .gte('created_at', `${startDate}T00:00:00Z`)
    .not('reseller_id', 'is', null) as unknown as {
      data: Array<{ total: number; reseller_id: string; reseller: { name: string } | null }> | null;
      error: unknown;
    };

  if (error) throw error;

  const map = new Map<string, ResellerStat>();
  for (const row of data ?? []) {
    if (!row.reseller_id || !row.reseller) continue;
    const existing = map.get(row.reseller_id) ?? {
      reseller_id: row.reseller_id,
      name: row.reseller.name,
      revenue: 0,
      order_count: 0,
    };
    existing.revenue += row.total;
    existing.order_count += 1;
    map.set(row.reseller_id, existing);
  }

  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
}

export async function getResellerClientStats(
  businessId: string,
  days = 30
): Promise<ResellerClientStat[]> {
  const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd');

  const { data, error } = await supabase
    .from('orders')
    .select(`
      total,
      reseller_client_id,
      client:reseller_clients!reseller_client_id(name),
      reseller:resellers!reseller_id(name)
    `)
    .eq('business_id', businessId)
    .eq('status', 'paid')
    .gte('created_at', `${startDate}T00:00:00Z`)
    .not('reseller_client_id', 'is', null) as unknown as {
      data: Array<{
        total: number;
        reseller_client_id: string;
        client: { name: string } | null;
        reseller: { name: string } | null;
      }> | null;
      error: unknown;
    };

  if (error) throw error;

  const map = new Map<string, ResellerClientStat>();
  for (const row of data ?? []) {
    if (!row.reseller_client_id || !row.client) continue;
    const existing = map.get(row.reseller_client_id) ?? {
      client_id: row.reseller_client_id,
      name: row.client.name,
      reseller_name: row.reseller?.name ?? '—',
      revenue: 0,
      order_count: 0,
    };
    existing.revenue += row.total;
    existing.order_count += 1;
    map.set(row.reseller_client_id, existing);
  }

  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
}

// ─── Coupon / promo stats ─────────────────────────────────────────────────────

export interface CouponStat {
  coupon_code: string;
  usage_count: number;
  total_discount: number;
  revenue: number;
}

export async function getCouponStats(
  businessId: string,
  days = 30
): Promise<CouponStat[]> {
  const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd');

  const { data, error } = await supabase
    .from('orders')
    .select('coupon_code, discount_amount, total')
    .eq('business_id', businessId)
    .eq('status', 'paid')
    .gte('created_at', `${startDate}T00:00:00Z`)
    .not('coupon_code', 'is', null) as unknown as {
      data: Array<{ coupon_code: string; discount_amount: number; total: number }> | null;
      error: unknown;
    };

  if (error) throw error;

  const map = new Map<string, CouponStat>();
  for (const row of data ?? []) {
    if (!row.coupon_code) continue;
    const existing = map.get(row.coupon_code) ?? {
      coupon_code: row.coupon_code,
      usage_count: 0,
      total_discount: 0,
      revenue: 0,
    };
    existing.usage_count += 1;
    existing.total_discount += row.discount_amount ?? 0;
    existing.revenue += row.total;
    map.set(row.coupon_code, existing);
  }

  return Array.from(map.values()).sort((a, b) => b.usage_count - a.usage_count);
}

// ─── Wholesale detail (per order-item) ───────────────────────────────────────

export interface WholesaleOrderItem {
  order_id: string;
  reseller_id: string;
  reseller_name: string;
  client_id: string | null;
  client_name: string | null;
  product_id: string;
  product_name: string;
  quantity: number;
  revenue: number;
}

export async function getResellerDetailStats(
  businessId: string,
  days = 30
): Promise<WholesaleOrderItem[]> {
  const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd');

  type OrderRow = {
    id: string;
    reseller_id: string;
    reseller_client_id: string | null;
    reseller: { id: string; name: string };
    client: { id: string; name: string } | null;
    items: { product_id: string; name: string; quantity: number; total: number }[];
  };

  const { data, error } = await supabase
    .from('orders')
    .select(`
      id,
      reseller_id,
      reseller_client_id,
      reseller:resellers!reseller_id(id, name),
      client:reseller_clients!reseller_client_id(id, name),
      items:order_items(product_id, name, quantity, total)
    `)
    .eq('business_id', businessId)
    .eq('status', 'paid')
    .not('reseller_id', 'is', null)
    .gte('created_at', `${startDate}T00:00:00Z`) as unknown as {
      data: OrderRow[] | null;
      error: unknown;
    };

  if (error) throw error;

  const result: WholesaleOrderItem[] = [];
  for (const order of data ?? []) {
    if (!order.reseller) continue;
    for (const item of order.items ?? []) {
      result.push({
        order_id:      order.id,
        reseller_id:   order.reseller_id,
        reseller_name: order.reseller.name,
        client_id:     order.reseller_client_id,
        client_name:   order.client?.name ?? null,
        product_id:    item.product_id,
        product_name:  item.name,
        quantity:      item.quantity,
        revenue:       item.total,
      });
    }
  }
  return result;
}

// ─── Daily sales ──────────────────────────────────────────────────────────────

export async function getDailySales(
  businessId: string,
  date: string
): Promise<{ total: number; count: number }> {
  const { data, error } = await supabase
    .from('orders')
    .select('total')
    .eq('business_id', businessId)
    .eq('status', 'paid')
    .gte('created_at', `${date}T00:00:00Z`)
    .lte('created_at', `${date}T23:59:59Z`);

  if (error) throw new Error(error.message);

  return {
    total: ((data ?? []) as Array<{ total: number }>).reduce((sum, o) => sum + o.total, 0),
    count: (data ?? []).length,
  };
}

// ─── Hotel analytics ──────────────────────────────────────────────────────────

export interface HotelRoomStat {
  room_id:     string;
  room_number: string;
  room_type:   string;
  checkouts:   number;
  revenue:     number;
  nights:      number;
}

export interface HotelAnalyticsSummary {
  total_revenue:          number;
  total_room_revenue:     number;
  total_services_revenue: number;
  total_checkouts:        number;
  avg_stay_value:         number;
  avg_nights:             number;
  outstanding_balance:    number;
  room_stats:             HotelRoomStat[];
}

export async function getHotelAnalytics(
  businessId: string,
  days = 30
): Promise<HotelAnalyticsSummary> {
  const { format: fmt2, subDays: sub2 } = await import('date-fns');
  const startDate = fmt2(sub2(new Date(), days), 'yyyy-MM-dd');

  const { data, error } = await (supabase as any)
    .from('hotel_reservations')
    .select('*, room:hotel_rooms(number, type)')
    .eq('business_id', businessId)
    .eq('status', 'checked_out')
    .gte('actual_check_out', `${startDate}T00:00:00Z`);

  if (error) throw new Error(error.message);

  const reservations = (data ?? []) as Array<{
    id: string; room_id: string;
    total: number; total_room: number; total_services: number; paid_amount: number;
    check_in: string; check_out: string;
    room: { number: string; type: string } | null;
  }>;

  const total_revenue          = reservations.reduce((s, r) => s + Number(r.total), 0);
  const total_room_revenue     = reservations.reduce((s, r) => s + Number(r.total_room), 0);
  const total_services_revenue = reservations.reduce((s, r) => s + Number(r.total_services), 0);
  const total_checkouts        = reservations.length;
  const avg_stay_value         = total_checkouts > 0 ? total_revenue / total_checkouts : 0;
  const outstanding_balance    = reservations.reduce((s, r) => s + Math.max(0, Number(r.total) - Number(r.paid_amount)), 0);
  const nightsTotal = reservations.reduce((s, r) => s + Math.max(1, Math.round((new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 86_400_000)), 0);
  const avg_nights = total_checkouts > 0 ? nightsTotal / total_checkouts : 0;

  const roomMap = new Map<string, HotelRoomStat>();
  for (const r of reservations) {
    const nights = Math.max(1, Math.round((new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 86_400_000));
    const existing = roomMap.get(r.room_id);
    if (existing) { existing.checkouts++; existing.revenue += Number(r.total); existing.nights += nights; }
    else roomMap.set(r.room_id, { room_id: r.room_id, room_number: r.room?.number ?? '?', room_type: r.room?.type ?? '?', checkouts: 1, revenue: Number(r.total), nights });
  }
  const room_stats = Array.from(roomMap.values()).sort((a, b) => b.revenue - a.revenue);

  return { total_revenue, total_room_revenue, total_services_revenue, total_checkouts, avg_stay_value, avg_nights, outstanding_balance, room_stats };
}

// ─── Juridique analytics ──────────────────────────────────────────────────────

export interface JuridiqueAnalyticsSummary {
  total_fees:          number;
  total_paid:          number;
  total_pending:       number;
  total_dossiers:      number;
  active_dossiers:     number;
  upcoming_audiences:  number;
  fees_by_type:        Array<{ type: string; amount: number; count: number }>;
  dossiers_by_status:  Array<{ status: string; count: number }>;
}

export async function getJuridiqueAnalytics(
  businessId: string,
  days = 30
): Promise<JuridiqueAnalyticsSummary> {
  const { format: fmt2, subDays: sub2 } = await import('date-fns');
  const startDate = fmt2(sub2(new Date(), days), 'yyyy-MM-dd');

  const [dossiersRes, feesRes] = await Promise.all([
    (supabase as any)
      .from('dossiers')
      .select('*')
      .eq('business_id', businessId)
      .gte('created_at', `${startDate}T00:00:00Z`),
    (supabase as any)
      .from('honoraires_cabinet')
      .select('*')
      .eq('business_id', businessId)
      .gte('date_facture', startDate),
  ]);

  if (dossiersRes.error) throw new Error(dossiersRes.error.message);
  if (feesRes.error) throw new Error(feesRes.error.message);

  const dossiers = dossiersRes.data ?? [];
  const fees     = feesRes.data ?? [];

  const total_fees    = fees.reduce((s: number, f: any) => s + Number(f.montant), 0);
  const total_paid    = fees.reduce((s: number, f: any) => s + Number(f.montant_paye), 0);
  const total_pending = total_fees - total_paid;

  const total_dossiers   = dossiers.length;
  const active_dossiers  = dossiers.filter((d: any) => !['clôturé', 'archivé'].includes(d.status)).length;
  const today = new Date().toISOString().split('T')[0];
  const upcoming_audiences = dossiers.filter((d: any) => d.date_audience && d.date_audience >= today).length;

  // Status breakdown
  const statusMap = new Map<string, number>();
  for (const d of (dossiers as any[])) {
    statusMap.set(d.status, (statusMap.get(d.status) ?? 0) + 1);
  }
  const dossiers_by_status = Array.from(statusMap.entries()).map(([status, count]) => ({ status, count }));

  // Fees by type breakdown
  const typeMap = new Map<string, { amount: number; count: number }>();
  for (const f of (fees as any[])) {
    const existing = typeMap.get(f.type_prestation) ?? { amount: 0, count: 0 };
    existing.amount += Number(f.montant);
    existing.count  += 1;
    typeMap.set(f.type_prestation, existing);
  }
  const fees_by_type = Array.from(typeMap.entries())
    .map(([type, stats]) => ({ type, ...stats }))
    .sort((a, b) => b.amount - a.amount);

  return {
    total_fees, total_paid, total_pending,
    total_dossiers, active_dossiers, upcoming_audiences,
    fees_by_type, dossiers_by_status,
  };
}
