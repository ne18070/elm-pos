import { supabaseAdmin } from './admin';
import { getAllSubscriptions, type SubscriptionRow } from './subscriptions';

export interface BusinessMonitorRow extends SubscriptionRow {
  orders_30d:     number;
  last_order_at:  string | null;
  members_count:  number;
  products_count: number;
  orders_total:   number;
  features:        string[];
  business_types:  string[];
}

export async function updateBusinessConfig(
  businessId: string,
  types:      string[],
  features:   string[],
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabaseAdmin as any)
    .from('businesses')
    .update({
      types,
      type: types[0] ?? null, // rétro-compat colonne type
      features,
    })
    .eq('id', businessId);
  if (error) throw new Error(error.message);
}

export async function getBusinessMonitoring(): Promise<BusinessMonitorRow[]> {
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [subs, ordersRaw, membersRaw, productsRaw, ordersTotalRaw, bizRaw] = await Promise.all([
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabaseAdmin as any)
      .from('products')
      .select('business_id')
      .eq('is_active', true),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabaseAdmin as any)
      .from('orders')
      .select('business_id'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabaseAdmin as any)
      .from('businesses')
      .select('id, features, type, types'),
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

  // Aggregate products per business
  const productsByBiz = new Map<string, number>();
  for (const row of (productsRaw.data ?? [])) {
    productsByBiz.set(row.business_id, (productsByBiz.get(row.business_id) ?? 0) + 1);
  }

  // Aggregate total orders per business (all time)
  const ordersTotalByBiz = new Map<string, number>();
  for (const row of (ordersTotalRaw.data ?? [])) {
    ordersTotalByBiz.set(row.business_id, (ordersTotalByBiz.get(row.business_id) ?? 0) + 1);
  }

  // Index business features and type
  const bizById = new Map<string, { features: string[]; types: string[] }>();
  for (const row of (bizRaw.data ?? [])) {
    // "types" est le nouveau tableau multi-type ; fallback sur "type" pour rétro-compat
    const types = (row.types && row.types.length > 0)
      ? row.types
      : row.type ? [row.type] : [];
    bizById.set(row.id, { features: row.features ?? [], types });
  }

  return subs.map((sub) => ({
    ...sub,
    orders_30d:      ordersByBiz.get(sub.business_id)?.count    ?? 0,
    last_order_at:   ordersByBiz.get(sub.business_id)?.last     ?? null,
    members_count:   membersByBiz.get(sub.business_id)          ?? 0,
    products_count:  productsByBiz.get(sub.business_id)         ?? 0,
    orders_total:    ordersTotalByBiz.get(sub.business_id)      ?? 0,
    features:        bizById.get(sub.business_id)?.features     ?? [],
    business_types:  bizById.get(sub.business_id)?.types        ?? [],
  }));
}
