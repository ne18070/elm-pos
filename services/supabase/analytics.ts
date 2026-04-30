import { supabase } from './client';
import type { AnalyticsSummary, DailyStat, TopProduct } from '../../types';
import { format, subDays } from 'date-fns';

export async function getAnalyticsSummary(
  businessId: string,
  days = 30
): Promise<AnalyticsSummary> {
  const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd');

  const [ordersResult, itemsResult, serviceOrdersResult, serviceItemsResult] = await Promise.all([
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

    (supabase as any)
      .from('service_orders')
      .select('id, total, paid_amount, paid_at, created_at')
      .eq('business_id', businessId)
      .eq('status', 'paye')
      .gte('paid_at', `${startDate}T00:00:00Z`),

    (supabase as any)
      .from('service_order_items')
      .select(`
        service_id,
        name,
        quantity,
        total,
        order:service_orders!inner(business_id, status, paid_at)
      `)
      .eq('order.business_id', businessId)
      .eq('order.status', 'paye')
      .gte('order.paid_at', `${startDate}T00:00:00Z`),
  ]);

  if (ordersResult.error) throw new Error(ordersResult.error.message);
  if (itemsResult.error) throw new Error(itemsResult.error.message);
  if (serviceOrdersResult.error) throw new Error(serviceOrdersResult.error.message);
  if (serviceItemsResult.error) throw new Error(serviceItemsResult.error.message);

  const orders = (ordersResult.data ?? []) as Array<{ total: number; created_at: string }>;
  const serviceOrders = (serviceOrdersResult.data ?? []) as Array<{ total: number; paid_amount: number; paid_at: string | null; created_at: string }>;
  const total_sales = orders.reduce((sum, o) => sum + o.total, 0) +
    serviceOrders.reduce((sum, o) => sum + Number(o.paid_amount ?? o.total), 0);
  const order_count = orders.length + serviceOrders.length;
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
  for (const order of serviceOrders) {
    const date = (order.paid_at ?? order.created_at).slice(0, 10);
    const existing = dailyMap.get(date) ?? {
      date,
      total_sales: 0,
      order_count: 0,
      avg_order_value: 0,
    };
    existing.total_sales += Number(order.paid_amount ?? order.total);
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
  for (const item of (serviceItemsResult.data ?? []) as Array<{ service_id: string | null; name: string; quantity: number; total: number }>) {
    const key = item.service_id ? `service:${item.service_id}` : `service:${item.name}`;
    const existing = productMap.get(key) ?? {
      product_id: key,
      name: item.name,
      quantity_sold: 0,
      revenue: 0,
    };
    existing.quantity_sold += item.quantity;
    existing.revenue += item.total;
    productMap.set(key, existing);
  }

  const top_products = Array.from(productMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  return { total_sales, order_count, avg_order_value, top_products, daily_stats };
}

// --- Reseller stats ----------------------------------------------------------

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
      reseller_name: row.reseller?.name ?? '-',
      revenue: 0,
      order_count: 0,
    };
    existing.revenue += row.total;
    existing.order_count += 1;
    map.set(row.reseller_client_id, existing);
  }

  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
}

// --- Coupon / promo stats -----------------------------------------------------

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

// --- Wholesale detail (per order-item) ---------------------------------------

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

// --- Daily sales --------------------------------------------------------------

export async function getDailySales(
  businessId: string,
  date: string
): Promise<{ total: number; count: number }> {
  const [{ data, error }, serviceRes] = await Promise.all([
    supabase
    .from('orders')
    .select('total')
    .eq('business_id', businessId)
    .eq('status', 'paid')
    .gte('created_at', `${date}T00:00:00Z`)
    .lte('created_at', `${date}T23:59:59Z`),
    (supabase as any)
      .from('service_orders')
      .select('paid_amount, total')
      .eq('business_id', businessId)
      .eq('status', 'paye')
      .gte('paid_at', `${date}T00:00:00Z`)
      .lte('paid_at', `${date}T23:59:59Z`),
  ]);

  if (error) throw new Error(error.message);
  if (serviceRes.error) throw new Error(serviceRes.error.message);

  const serviceOrders = (serviceRes.data ?? []) as Array<{ paid_amount: number; total: number }>;

  return {
    total: ((data ?? []) as Array<{ total: number }>).reduce((sum, o) => sum + o.total, 0) +
      serviceOrders.reduce((sum, o) => sum + Number(o.paid_amount ?? o.total), 0),
    count: (data ?? []).length + serviceOrders.length,
  };
}

// --- Hotel analytics ----------------------------------------------------------

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
  occupancy_rate:         number;
  occupied_rooms:         number;
  room_stats:             HotelRoomStat[];
  daily_revenue:          Array<{ date: string; total: number }>;
}

export async function getHotelAnalytics(
  businessId: string,
  days = 30
): Promise<HotelAnalyticsSummary> {
  const { format: fmt2, subDays: sub2 } = await import('date-fns');
  const startDate = fmt2(sub2(new Date(), days), 'yyyy-MM-dd');

  const [resResult, roomsResult] = await Promise.all([
    (supabase as any)
      .from('hotel_reservations')
      .select('*, room:hotel_rooms(number, type)')
      .eq('business_id', businessId)
      .eq('status', 'checked_out')
      .gte('actual_check_out', `${startDate}T00:00:00Z`),
    (supabase as any)
      .from('hotel_rooms')
      .select('status')
      .eq('business_id', businessId)
      .eq('is_active', true)
  ]);

  if (resResult.error) throw new Error(resResult.error.message);
  if (roomsResult.error) throw new Error(roomsResult.error.message);

  const reservations = (resResult.data ?? []) as Array<{
    id: string; room_id: string;
    total: number; total_room: number; total_services: number; paid_amount: number;
    check_in: string; check_out: string;
    room: { number: string; type: string } | null;
  }>;

  const rooms = (roomsResult.data ?? []) as Array<{ status: string }>;
  const occupied_rooms = rooms.filter(r => r.status === 'occupied').length;
  const occupancy_rate = rooms.length > 0 ? Math.round((occupied_rooms / rooms.length) * 100) : 0;

  const total_revenue          = reservations.reduce((s, r) => s + Number(r.total), 0);
  const total_room_revenue     = reservations.reduce((s, r) => s + Number(r.total_room), 0);
  const total_services_revenue = reservations.reduce((s, r) => s + Number(r.total_services), 0);
  const total_checkouts        = reservations.length;
  const avg_stay_value         = total_checkouts > 0 ? total_revenue / total_checkouts : 0;
  const outstanding_balance    = reservations.reduce((s, r) => s + Math.max(0, Number(r.total) - Number(r.paid_amount)), 0);
  const nightsTotal = reservations.reduce((s, r) => s + Math.max(1, Math.round((new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 86_400_000)), 0);
  const avg_nights = total_checkouts > 0 ? nightsTotal / total_checkouts : 0;

  const roomMap = new Map<string, HotelRoomStat>();
  const dayMap  = new Map<string, number>();
  for (const r of reservations) {
    const nights = Math.max(1, Math.round((new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 86_400_000));
    const existing = roomMap.get(r.room_id);
    if (existing) { existing.checkouts++; existing.revenue += Number(r.total); existing.nights += nights; }
    else roomMap.set(r.room_id, { room_id: r.room_id, room_number: r.room?.number ?? '?', room_type: r.room?.type ?? '?', checkouts: 1, revenue: Number(r.total), nights });
    // daily
    const d = (r as any).actual_check_out?.slice(0, 10) ?? r.check_out?.slice(0, 10);
    if (d) dayMap.set(d, (dayMap.get(d) ?? 0) + Number(r.total));
  }
  const room_stats    = Array.from(roomMap.values()).sort((a, b) => b.revenue - a.revenue);
  const daily_revenue = Array.from(dayMap.entries()).map(([date, total]) => ({ date, total })).sort((a, b) => a.date.localeCompare(b.date));

  return {
    total_revenue, total_room_revenue, total_services_revenue, total_checkouts,
    avg_stay_value, avg_nights, outstanding_balance, room_stats,
    occupancy_rate, occupied_rooms, daily_revenue,
  };
}

// --- Juridique analytics ------------------------------------------------------

export interface JuridiqueAnalyticsSummary {
  total_fees:          number;
  total_paid:          number;
  total_pending:       number;
  total_dossiers:      number;
  active_dossiers:     number;
  upcoming_audiences:  number;
  fees_by_type:        Array<{ type: string; amount: number; count: number }>;
  dossiers_by_status:  Array<{ status: string; count: number }>;
  daily_fees:          Array<{ date: string; amount: number }>;
  monthly_fees:        Array<{ month: string; amount: number }>;
}

export async function getJuridiqueAnalytics(
  businessId: string,
  days = 30
): Promise<JuridiqueAnalyticsSummary> {
  const { format: fmt2, subDays: sub2, startOfMonth, endOfMonth } = await import('date-fns');
  const startDate = fmt2(sub2(new Date(), days), 'yyyy-MM-dd');
  const sixMonthsAgo = fmt2(sub2(new Date(), 180), 'yyyy-MM-01');

  const [dossiersRes, feesRes, allDossiersRes, historyRes] = await Promise.all([
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
    (supabase as any)
      .from('dossiers')
      .select('status')
      .eq('business_id', businessId),
    (supabase as any)
      .from('honoraires_cabinet')
      .select('montant, date_facture')
      .eq('business_id', businessId)
      .gte('date_facture', sixMonthsAgo),
  ]);

  if (dossiersRes.error) throw new Error(dossiersRes.error.message);
  if (feesRes.error) throw new Error(feesRes.error.message);
  if (allDossiersRes.error) throw new Error(allDossiersRes.error.message);
  if (historyRes.error) throw new Error(historyRes.error.message);

  const dossiers = dossiersRes.data ?? [];
  const fees     = feesRes.data ?? [];
  const allDossiers = allDossiersRes.data ?? [];
  const history = historyRes.data ?? [];

  const total_fees    = fees.reduce((s: number, f: any) => s + Number(f.montant), 0);
  const total_paid    = fees.reduce((s: number, f: any) => s + Number(f.montant_paye), 0);
  const total_pending = total_fees - total_paid;

  const total_dossiers   = allDossiers.length;
  const active_dossiers  = allDossiers.filter((d: any) => !['clôturé', 'archivé'].includes(d.status)).length;
  const todayStr = new Date().toISOString().split('T')[0];
  
  const { data: upcomingRes } = await (supabase as any)
    .from('dossiers')
    .select('id')
    .eq('business_id', businessId)
    .gte('date_audience', todayStr);
  const upcoming_audiences = upcomingRes?.length ?? 0;

  const statusMap = new Map<string, number>();
  for (const d of (allDossiers as any[])) {
    statusMap.set(d.status, (statusMap.get(d.status) ?? 0) + 1);
  }
  const dossiers_by_status = Array.from(statusMap.entries()).map(([status, count]) => ({ status, count }));

  const typeMap = new Map<string, { amount: number; count: number }>();
  const dayMap = new Map<string, number>();
  for (const f of (fees as any[])) {
    const existing = typeMap.get(f.type_prestation) ?? { amount: 0, count: 0 };
    existing.amount += Number(f.montant);
    existing.count  += 1;
    typeMap.set(f.type_prestation, existing);

    const d = f.date_facture;
    dayMap.set(d, (dayMap.get(d) ?? 0) + Number(f.montant));
  }

  const fees_by_type = Array.from(typeMap.entries())
    .map(([type, stats]) => ({ type, ...stats }))
    .sort((a, b) => b.amount - a.amount);

  const daily_fees = Array.from(dayMap.entries())
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Monthly breakdown for growth
  const monthMap = new Map<string, number>();
  for (const f of (history as any[])) {
    const m = f.date_facture.slice(0, 7); // YYYY-MM
    monthMap.set(m, (monthMap.get(m) ?? 0) + Number(f.montant));
  }
  const monthly_fees = Array.from(monthMap.entries())
    .map(([month, amount]) => ({ month, amount }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return {
    total_fees, total_paid, total_pending,
    total_dossiers, active_dossiers, upcoming_audiences,
    fees_by_type, dossiers_by_status, daily_fees, monthly_fees,
  };
}

// --- Voitures analytics -------------------------------------------------------

export interface VoituresAnalyticsSummary {
  ca_voitures:       number;
  vendus_count:      number;
  leads_total:       number;
  leads_nouveaux:    number;
  leads_convertis:   number;
  parc_total:        number;
  parc_disponible:   number;
  recent_ventes:     Array<{ id: string; marque: string; modele: string; annee: number | null; prix: number; updated_at: string }>;
}

export async function getVoituresAnalytics(
  businessId: string,
  days = 30,
): Promise<VoituresAnalyticsSummary> {
  const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd');
  const db = (supabase as any);

  const [parcResult, venteResult, leadsResult] = await Promise.all([
    db.from('voitures').select('statut').eq('business_id', businessId),
    db.from('voitures')
      .select('id, marque, modele, annee, prix, updated_at')
      .eq('business_id', businessId)
      .eq('statut', 'vendu')
      .gte('updated_at', `${startDate}T00:00:00Z`)
      .order('updated_at', { ascending: false }),
    db.from('voiture_leads')
      .select('statut')
      .eq('business_id', businessId)
      .gte('created_at', `${startDate}T00:00:00Z`),
  ]);

  const parc        = (parcResult.data ?? []) as Array<{ statut: string }>;
  const ventes      = (venteResult.data ?? []) as Array<{ id: string; marque: string; modele: string; annee: number | null; prix: number; updated_at: string }>;
  const leads       = (leadsResult.data ?? []) as Array<{ statut: string }>;

  return {
    ca_voitures:     ventes.reduce((s, v) => s + v.prix, 0),
    vendus_count:    ventes.length,
    leads_total:     leads.length,
    leads_nouveaux:  leads.filter(l => l.statut === 'nouveau').length,
    leads_convertis: leads.filter(l => l.statut === 'converti').length,
    parc_total:      parc.length,
    parc_disponible: parc.filter(v => v.statut === 'disponible').length,
    recent_ventes:   ventes.slice(0, 10),
  };
}

// --- Période précédente (comparaison) -----------------------------------------

export interface PrevPeriodCA {
  total_sales: number;
  total_fees:  number;
  total_hotel: number;
}

export async function getPrevPeriodCA(
  businessId: string,
  days: number,
  hasHotel: boolean,
  hasJuridique: boolean,
): Promise<PrevPeriodCA> {
  const end   = format(subDays(new Date(), days), 'yyyy-MM-dd');
  const start = format(subDays(new Date(), days * 2), 'yyyy-MM-dd');
  const db    = supabase as any;

  const [ordersRes, serviceOrdersRes, feesRes, hotelRes] = await Promise.all([
    supabase
      .from('orders')
      .select('total')
      .eq('business_id', businessId)
      .eq('status', 'paid')
      .gte('created_at', `${start}T00:00:00Z`)
      .lt('created_at',  `${end}T23:59:59Z`),
    db.from('service_orders')
      .select('paid_amount, total')
      .eq('business_id', businessId)
      .eq('status', 'paye')
      .gte('paid_at', `${start}T00:00:00Z`)
      .lt('paid_at',  `${end}T23:59:59Z`),
    hasJuridique
      ? db.from('honoraires_cabinet').select('montant')
          .eq('business_id', businessId)
          .gte('date_facture', start).lte('date_facture', end)
      : Promise.resolve({ data: [] }),
    hasHotel
      ? db.from('hotel_reservations').select('total')
          .eq('business_id', businessId).eq('status', 'checked_out')
          .gte('actual_check_out', `${start}T00:00:00Z`)
          .lt('actual_check_out',  `${end}T23:59:59Z`)
      : Promise.resolve({ data: [] }),
  ]);

  if (ordersRes.error) throw new Error(ordersRes.error.message);
  if (serviceOrdersRes.error) throw new Error(serviceOrdersRes.error.message);
  if (feesRes.error) throw new Error(feesRes.error.message);
  if (hotelRes.error) throw new Error(hotelRes.error.message);

  return {
    total_sales: ((ordersRes.data ?? []) as any[]).reduce((s, o) => s + Number(o.total), 0) +
      ((serviceOrdersRes.data ?? []) as any[]).reduce((s, o) => s + Number(o.paid_amount ?? o.total), 0),
    total_fees:  ((feesRes.data  ?? []) as any[]).reduce((s, f) => s + Number(f.montant), 0),
    total_hotel: ((hotelRes.data ?? []) as any[]).reduce((s, r) => s + Number(r.total), 0),
  };
}

// --- Revendeurs analytics (KPI summary) ----------------------------------------

export interface RevendeursAnalyticsSummary {
  total_ca:      number;
  total_orders:  number;
  top_resellers: Array<{ id: string; name: string; revenue: number; order_count: number; type: string; zone: string | null }>;
  by_type:       Array<{ type: string; revenue: number; count: number }>;
  by_zone:       Array<{ zone: string; revenue: number; count: number }>;
}

export async function getRevendeursAnalytics(
  businessId: string,
  days = 30,
): Promise<RevendeursAnalyticsSummary> {
  const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd');

  const { data, error } = await supabase
    .from('orders')
    .select('total, reseller_id, reseller:resellers!reseller_id(id, name, type, zone)')
    .eq('business_id', businessId)
    .eq('status', 'paid')
    .gte('created_at', `${startDate}T00:00:00Z`)
    .not('reseller_id', 'is', null) as unknown as {
      data: Array<{
        total: number;
        reseller_id: string;
        reseller: { id: string; name: string; type: string; zone: string | null } | null;
      }> | null;
      error: unknown;
    };

  if (error) throw error;

  const resellerMap = new Map<string, { id: string; name: string; revenue: number; order_count: number; type: string; zone: string | null }>();
  const typeMap     = new Map<string, { revenue: number; count: number }>();
  const zoneMap     = new Map<string, { revenue: number; count: number }>();
  let total_ca = 0, total_orders = 0;

  for (const row of data ?? []) {
    if (!row.reseller) continue;
    total_ca += row.total;
    total_orders++;

    const r = resellerMap.get(row.reseller_id) ?? { id: row.reseller.id, name: row.reseller.name, revenue: 0, order_count: 0, type: row.reseller.type ?? 'gros', zone: row.reseller.zone };
    r.revenue += row.total; r.order_count++;
    resellerMap.set(row.reseller_id, r);

    const t = row.reseller.type ?? 'gros';
    const et = typeMap.get(t) ?? { revenue: 0, count: 0 };
    et.revenue += row.total; et.count++;
    typeMap.set(t, et);

    if (row.reseller.zone) {
      const ez = zoneMap.get(row.reseller.zone) ?? { revenue: 0, count: 0 };
      ez.revenue += row.total; ez.count++;
      zoneMap.set(row.reseller.zone, ez);
    }
  }

  return {
    total_ca,
    total_orders,
    top_resellers: Array.from(resellerMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    by_type: Array.from(typeMap.entries()).map(([type, s]) => ({ type, ...s })).sort((a, b) => b.revenue - a.revenue),
    by_zone: Array.from(zoneMap.entries()).map(([zone, s]) => ({ zone, ...s })).sort((a, b) => b.revenue - a.revenue),
  };
}

// --- Services analytics -------------------------------------------------------

export interface ServicesAnalyticsSummary {
  ca_paye:         number;
  ca_pending:      number;
  count_paye:      number;
  count_en_cours:  number;
  count_attente:   number;
  count_termine:   number;
  count_annule:    number;
  completion_rate: number;
  avg_order_value: number;
  top_services:    Array<{ name: string; count: number; revenue: number }>;
  daily_revenue:   Array<{ date: string; total: number; count: number }>;
}

export async function getServicesAnalytics(
  businessId: string,
  days = 30,
): Promise<ServicesAnalyticsSummary> {
  const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd');
  const db = supabase as any;

  const [ordersRes, itemsRes] = await Promise.all([
    db
      .from('service_orders')
      .select('id, total, paid_amount, status, created_at, paid_at')
      .eq('business_id', businessId)
      .gte('created_at', `${startDate}T00:00:00Z`),
    db
      .from('service_order_items')
      .select('name, quantity, total, order:service_orders!inner(business_id, status, paid_at)')
      .eq('order.business_id', businessId)
      .eq('order.status', 'paye')
      .gte('order.paid_at', `${startDate}T00:00:00Z`),
  ]);

  if (ordersRes.error) throw new Error(ordersRes.error.message);
  if (itemsRes.error)  throw new Error(itemsRes.error.message);

  type OrderRow = { id: string; total: number; paid_amount: number; status: string; created_at: string; paid_at: string | null };
  const orders = (ordersRes.data ?? []) as OrderRow[];

  const count_paye     = orders.filter(o => o.status === 'paye').length;
  const count_en_cours = orders.filter(o => o.status === 'en_cours').length;
  const count_attente  = orders.filter(o => o.status === 'attente').length;
  const count_termine  = orders.filter(o => o.status === 'termine').length;
  const count_annule   = orders.filter(o => o.status === 'annule').length;
  const total_excl_annule = orders.length - count_annule;

  const ca_paye    = orders.filter(o => o.status === 'paye').reduce((s, o) => s + Number(o.paid_amount ?? o.total), 0);
  const ca_pending = orders.filter(o => ['attente', 'en_cours', 'termine'].includes(o.status)).reduce((s, o) => s + Number(o.total), 0);
  const completion_rate  = total_excl_annule > 0 ? Math.round(((count_paye + count_termine) / total_excl_annule) * 100) : 0;
  const avg_order_value  = count_paye > 0 ? ca_paye / count_paye : 0;

  const dayMap = new Map<string, { total: number; count: number }>();
  for (const o of orders.filter(o => o.status === 'paye')) {
    const d = (o.paid_at ?? o.created_at).slice(0, 10);
    const e = dayMap.get(d) ?? { total: 0, count: 0 };
    e.total += Number(o.paid_amount ?? o.total);
    e.count++;
    dayMap.set(d, e);
  }
  const daily_revenue = Array.from(dayMap.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  type ItemRow = { name: string; quantity: number; total: number };
  const serviceMap = new Map<string, { name: string; count: number; revenue: number }>();
  for (const item of (itemsRes.data ?? []) as ItemRow[]) {
    const existing = serviceMap.get(item.name) ?? { name: item.name, count: 0, revenue: 0 };
    existing.count   += item.quantity;
    existing.revenue += item.total;
    serviceMap.set(item.name, existing);
  }
  const top_services = Array.from(serviceMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  return {
    ca_paye, ca_pending,
    count_paye, count_en_cours, count_attente, count_termine, count_annule,
    completion_rate, avg_order_value,
    top_services, daily_revenue,
  };
}

// --- Approvisionnement analytics -----------------------------------------------

export interface ApprovAnalyticsSummary {
  total_depense:  number;
  total_entries:  number;
  po_received:    number;
  top_suppliers:  Array<{ name: string; total: number; entries: number }>;
  top_products:   Array<{ product_id: string; name: string; quantity: number; cost: number }>;
  monthly:        Array<{ month: string; total: number; entries: number }>;
}

export async function getApprovisionnementAnalytics(
  businessId: string,
  days = 30,
): Promise<ApprovAnalyticsSummary> {
  const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd');
  const db        = supabase as any;

  const [entriesRes, poRes] = await Promise.all([
    db.from('stock_entries')
      .select('quantity, cost_per_unit, supplier, created_at, product:products(id, name)')
      .eq('business_id', businessId)
      .gte('created_at', `${startDate}T00:00:00Z`),
    db.from('purchase_orders')
      .select('id')
      .eq('business_id', businessId)
      .eq('status', 'received')
      .gte('received_at', `${startDate}T00:00:00Z`),
  ]);

  if (entriesRes.error) throw new Error(entriesRes.error.message);

  const entries = (entriesRes.data ?? []) as Array<{
    quantity: number; cost_per_unit: number | null; supplier: string | null;
    created_at: string; product: { id: string; name: string } | null;
  }>;

  let total_depense = 0;
  const supplierMap = new Map<string, { total: number; entries: number }>();
  const productMap  = new Map<string, { product_id: string; name: string; quantity: number; cost: number }>();
  const monthMap    = new Map<string, { total: number; entries: number }>();

  for (const e of entries) {
    const cost = e.cost_per_unit != null ? e.quantity * e.cost_per_unit : 0;
    total_depense += cost;

    const month = e.created_at.slice(0, 7);
    const me = monthMap.get(month) ?? { total: 0, entries: 0 };
    me.total += cost; me.entries++;
    monthMap.set(month, me);

    if (e.supplier) {
      const se = supplierMap.get(e.supplier) ?? { total: 0, entries: 0 };
      se.total += cost; se.entries++;
      supplierMap.set(e.supplier, se);
    }

    if (e.product) {
      const pe = productMap.get(e.product.id) ?? { product_id: e.product.id, name: e.product.name, quantity: 0, cost: 0 };
      pe.quantity += e.quantity; pe.cost += cost;
      productMap.set(e.product.id, pe);
    }
  }

  return {
    total_depense,
    total_entries: entries.length,
    po_received:   (poRes.data ?? []).length,
    top_suppliers: Array.from(supplierMap.entries()).map(([name, s]) => ({ name, ...s })).sort((a, b) => b.total - a.total).slice(0, 10),
    top_products:  Array.from(productMap.values()).sort((a, b) => b.cost - a.cost).slice(0, 10),
    monthly:       Array.from(monthMap.entries()).map(([month, s]) => ({ month, ...s })).sort((a, b) => a.month.localeCompare(b.month)),
  };
}
