import { supabase } from './client';
import { getAllSubscriptions, type SubscriptionRow } from './subscriptions';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface BusinessMonitorRow extends SubscriptionRow {
  orders_30d:     number;
  last_order_at:  string | null;
  members_count:  number;
  products_count: number;
  orders_total:   number;
  features:       string[];
  business_types: string[];
}

export async function updateBusinessConfig(
  businessId: string,
  types:      string[],
  features:   string[],
): Promise<void> {
  // types[] are UUIDs from business_types table - never write them to the legacy
  // `type` TEXT column which has a strict CHECK constraint on legacy enum values.
  const { error } = await db
    .from('businesses')
    .update({ types, features })
    .eq('id', businessId);
  if (error) throw new Error(error.message);
}

export async function getBusinessMonitoring(): Promise<BusinessMonitorRow[]> {
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // On utilise le client standard. Les permissions sont gérées par RLS (is_superadmin check)
  const [subs, ordersRaw, membersRaw, productsRaw, ordersTotalRaw, bizRaw] = await Promise.all([
    getAllSubscriptions(),
    db.from('orders').select('business_id, created_at').gte('created_at', since30d),
    db.from('business_members').select('business_id'),
    db.from('products').select('business_id').eq('is_active', true),
    db.from('orders').select('business_id'),
    db.from('businesses').select('id, features, type, types'),
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
    const types = (row.types && row.types.length > 0)
      ? row.types
      : row.type ? [row.type] : [];
    bizById.set(row.id, { features: row.features ?? [], types });
  }

  // Étendre : une ligne par établissement (pas par abonnement)
  const rows: BusinessMonitorRow[] = [];
  for (const sub of subs) {
    const bizList = sub.businesses?.length
      ? sub.businesses
      : [{ id: sub.business_id, name: sub.business_name }];

    for (const biz of bizList) {
      rows.push({
        ...sub,
        business_id:   biz.id,
        business_name: biz.name,
        orders_30d:      ordersByBiz.get(biz.id)?.count    ?? 0,
        last_order_at:   ordersByBiz.get(biz.id)?.last     ?? null,
        members_count:   membersByBiz.get(biz.id)          ?? 0,
        products_count:  productsByBiz.get(biz.id)         ?? 0,
        orders_total:    ordersTotalByBiz.get(biz.id)      ?? 0,
        features:       bizById.get(biz.id)?.features ?? [],
        business_types: bizById.get(biz.id)?.types   ?? [],
      });
    }
  }
  return rows;
}

// --- Observabilité Technique --------------------------------------------------

export interface TechnicalVital {
  category: string;
  error_count: number;
  avg_latency: number;
}

export interface TechnicalLog {
  id: string;
  level: string;
  category: string;
  message: string;
  context: any;
  latency_ms: number | null;
  url: string | null;
  created_at: string;
  business_name?: string;
}

export async function getTechnicalVitals(): Promise<TechnicalVital[]> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  
  const { data, error } = await db
    .from('monitoring_vitals')
    .select('category, level, latency_ms')
    .gte('created_at', since24h);

  if (error) throw error;

  const stats = new Map<string, { errors: number; latencies: number[]; count: number }>();
  
  for (const row of (data ?? [])) {
    const prev = stats.get(row.category) || { errors: 0, latencies: [], count: 0 };
    if (row.level === 'error') prev.errors++;
    if (row.latency_ms) prev.latencies.push(row.latency_ms);
    prev.count++;
    stats.set(row.category, prev);
  }

  return Array.from(stats.entries()).map(([cat, s]) => ({
    category: cat,
    error_count: s.errors,
    avg_latency: s.latencies.length ? Math.round(s.latencies.reduce((a, b) => a + b, 0) / s.latencies.length) : 0
  }));
}

export async function getRecentLogs(limit = 50): Promise<TechnicalLog[]> {
  const { data, error } = await db
    .from('monitoring_vitals')
    .select(`
      *,
      businesses ( name )
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    ...row,
    business_name: row.businesses?.name
  }));
}

export async function getConversionStats() {
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await db
    .from('analytics_events')
    .select('event_name, business_id')
    .gte('created_at', since7d);

  if (error) throw error;

  const funnel = {
    signup_started: 0,
    signup_completed: 0,
    trial_started: 0,
    provisioning_success: 0,
    first_sale: 0
  };

  for (const row of (data ?? [])) {
    if (funnel.hasOwnProperty(row.event_name)) {
      (funnel as any)[row.event_name]++;
    }
  }

  return funnel;
}

// --- CEO Dashboard -----------------------------------------------------------

export interface CEOStats {
  mrr:                number;
  active_businesses:  number;
  trial_businesses:   number;
  signup_today:       number;
  signup_7d:          number;
  conversion_rate:    number;
  revenue_30d:        number;
  funnel: {
    signup_started:       number;
    signup_completed:     number;
    provisioning_success: number;
    first_sale:           number;
  };
  signups_by_day: Record<string, number>;
}

export async function getCEOStats(): Promise<CEOStats> {
  const since7d  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000).toISOString();
  const since24h = new Date(Date.now() - 1  * 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [subs, events7d, events24h, orders30d] = await Promise.all([
    getAllSubscriptions(),
    db.from('analytics_events').select('event_name, created_at').gte('created_at', since7d),
    db.from('analytics_events').select('event_name').gte('created_at', since24h),
    db.from('orders').select('total_amount').gte('created_at', since30d),
  ]);

  const activeSubs = subs.filter((s: any) => s.status === 'active');
  const trialSubs  = subs.filter((s: any) => s.status === 'trial');
  const mrr        = activeSubs.reduce((acc: number, s: any) => acc + (Number(s.plan_price) || 0), 0);
  const revenue30d = (orders30d.data ?? []).reduce((acc: number, o: any) => acc + (Number(o.total_amount) || 0), 0);

  const funnel = { signup_started: 0, signup_completed: 0, provisioning_success: 0, first_sale: 0 };
  const signupsByDay: Record<string, number> = {};

  for (const e of (events7d.data ?? [])) {
    if (funnel.hasOwnProperty(e.event_name)) (funnel as any)[e.event_name]++;
    if (e.event_name === 'signup_started') {
      const day = e.created_at.slice(0, 10);
      signupsByDay[day] = (signupsByDay[day] ?? 0) + 1;
    }
  }

  const signupToday = (events24h.data ?? []).filter((e: any) => e.event_name === 'signup_started').length;

  return {
    mrr,
    active_businesses: activeSubs.length,
    trial_businesses:  trialSubs.length,
    signup_today:      signupToday,
    signup_7d:         funnel.signup_started,
    conversion_rate:   funnel.signup_started > 0
      ? Math.round((funnel.provisioning_success / funnel.signup_started) * 100)
      : 0,
    revenue_30d:       revenue30d,
    funnel,
    signups_by_day:    signupsByDay,
  };
}

// --- CTO Dashboard -----------------------------------------------------------

export interface AlertLogEntry {
  rule_code: string;
  value:     number | null;
  fired_at:  string;
}

export interface SlowQuery {
  query_text:    string;
  calls:         number;
  mean_ms:       number;
  total_ms:      number;
  rows_returned: number;
}

export interface DbHealth {
  active_connections: number;
  blocked_locks:      number;
  db_size_bytes:      number;
  cache_hit_ratio:    number;
}

export interface CTOStats {
  latency:           { p50: number; p95: number };
  error_rate_1h:     number;
  total_events_24h:  number;
  total_errors_24h:  number;
  errors_by_category: Record<string, number>;
  top_errors:        { message: string; count: number }[];
  alert_log:         AlertLogEntry[];
  db_health:         DbHealth | null;
  slow_queries:      SlowQuery[];
}

export async function getCTOStats(): Promise<CTOStats> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since1h  = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const [vitals24hRes, alertLogRes, dbHealthRes, slowQueriesRes] = await Promise.allSettled([
    db.from('monitoring_vitals')
      .select('category, level, latency_ms, message, created_at')
      .gte('created_at', since24h)
      .limit(2000),
    db.from('monitoring_alert_log')
      .select('rule_code, value, fired_at')
      .order('fired_at', { ascending: false })
      .limit(10),
    db.rpc('get_db_health'),
    db.rpc('get_slow_queries', { p_limit: 5 }),
  ]);

  const vitals: any[] = vitals24hRes.status === 'fulfilled' ? (vitals24hRes.value.data ?? []) : [];

  // Latency percentiles (API calls only)
  const apiLatencies = vitals
    .filter((v: any) => v.category === 'api' && v.latency_ms != null)
    .map((v: any) => v.latency_ms as number)
    .sort((a: number, b: number) => a - b);

  const p50 = apiLatencies.length ? apiLatencies[Math.floor(apiLatencies.length * 0.50)] ?? 0 : 0;
  const p95 = apiLatencies.length ? apiLatencies[Math.floor(apiLatencies.length * 0.95)] ?? 0 : 0;

  // Error breakdown
  const errorsByCategory: Record<string, number> = {};
  const messageCounts: Record<string, number>    = {};

  for (const v of vitals) {
    if (v.level === 'error') {
      errorsByCategory[v.category] = (errorsByCategory[v.category] ?? 0) + 1;
      const key = (v.message ?? 'Unknown').slice(0, 100);
      messageCounts[key] = (messageCounts[key] ?? 0) + 1;
    }
  }

  const topErrors = Object.entries(messageCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([message, count]) => ({ message, count }));

  // Error rate last 1h
  const recent     = vitals.filter((v: any) => v.created_at >= since1h);
  const errorRate1h = recent.length > 0
    ? Math.round((recent.filter((v: any) => v.level === 'error').length / recent.length) * 100)
    : 0;

  return {
    latency:            { p50, p95 },
    error_rate_1h:      errorRate1h,
    total_events_24h:   vitals.length,
    total_errors_24h:   vitals.filter((v: any) => v.level === 'error').length,
    errors_by_category: errorsByCategory,
    top_errors:         topErrors,
    alert_log:          alertLogRes.status === 'fulfilled' ? (alertLogRes.value.data ?? []) : [],
    db_health:          dbHealthRes.status === 'fulfilled' ? (dbHealthRes.value.data ?? null) : null,
    slow_queries:       slowQueriesRes.status === 'fulfilled' ? (slowQueriesRes.value.data ?? []) : [],
  };
}
