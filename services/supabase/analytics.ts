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

  const orders = ordersResult.data ?? [];
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
  const productMap = new Map<string, TopProduct>();
  for (const item of itemsResult.data ?? []) {
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
    total: (data ?? []).reduce((sum, o) => sum + o.total, 0),
    count: (data ?? []).length,
  };
}
