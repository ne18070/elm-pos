import { supabaseAdmin } from './admin';
import { getAllSubscriptions, type SubscriptionRow } from './subscriptions';

export interface BusinessMonitorRow extends SubscriptionRow {
  orders_30d:    number;
  last_order_at: string | null;
  members_count: number;
}

export async function getBusinessMonitoring(): Promise<BusinessMonitorRow[]> {
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [subs, ordersRaw, membersRaw] = await Promise.all([
    getAllSubscriptions(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabaseAdmin as any)
      .from('orders')
      .select('business_id, created_at')
      .gte('created_at', since30d),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabaseAdmin as any)
      .from('business_members')
      .select('business_id'),
  ]);

  // Aggregate orders per business
  const ordersByBiz = new Map<string, { count: number; last: string | null }>();
  for (const row of (ordersRaw.data ?? [])) {
    const prev = ordersByBiz.get(row.business_id);
    const last = !prev?.last || row.created_at > prev.last ? row.created_at : prev.last;
    ordersByBiz.set(row.business_id, { count: (prev?.count ?? 0) + 1, last });
  }

  // Aggregate members per business
  const membersByBiz = new Map<string, number>();
  for (const row of (membersRaw.data ?? [])) {
    membersByBiz.set(row.business_id, (membersByBiz.get(row.business_id) ?? 0) + 1);
  }

  return subs.map((sub) => ({
    ...sub,
    orders_30d:    ordersByBiz.get(sub.business_id)?.count ?? 0,
    last_order_at: ordersByBiz.get(sub.business_id)?.last  ?? null,
    members_count: membersByBiz.get(sub.business_id) ?? 0,
  }));
}
