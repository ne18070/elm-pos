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
  public_slug:    string | null;
}

export async function updateBusinessConfig(
  businessId: string,
  types:      string[],
  features:   string[],
  publicSlug?: string,
): Promise<void> {
  // types[] are UUIDs from business_types table - never write them to the legacy
  // `type` TEXT column which has a strict CHECK constraint on legacy enum values.
  const { error } = await db
    .from('businesses')
    .update({ types, features, public_slug: publicSlug })
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
    db.from('businesses').select('id, features, type, types, public_slug'),
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
  const bizById = new Map<string, { features: string[]; types: string[]; public_slug: string | null }>();
  for (const row of (bizRaw.data ?? [])) {
    const types = (row.types && row.types.length > 0)
      ? row.types
      : row.type ? [row.type] : [];
    bizById.set(row.id, { features: row.features ?? [], types, public_slug: row.public_slug ?? null });
  }

  // Étendre : une ligne par établissement (pas par abonnement)
  const rows: BusinessMonitorRow[] = [];
  const seenBizIds = new Set<string>();

  for (const sub of subs) {
    const bizList = sub.businesses?.length
      ? sub.businesses
      : [{ id: sub.business_id, name: sub.business_name }];

    for (const biz of bizList) {
      if (seenBizIds.has(biz.id)) continue;
      seenBizIds.add(biz.id);

      rows.push({
        ...sub,
        business_id:   biz.id,
        business_name: biz.name,
        orders_30d:      ordersByBiz.get(biz.id)?.count    ?? 0,
        last_order_at:   ordersByBiz.get(biz.id)?.last     ?? null,
        members_count:   membersByBiz.get(biz.id)          ?? 0,
        products_count:  productsByBiz.get(biz.id)         ?? 0,
        orders_total:    ordersTotalByBiz.get(biz.id)      ?? 0,
        features:       bizById.get(biz.id)?.features   ?? [],
        business_types: bizById.get(biz.id)?.types     ?? [],
        public_slug:    bizById.get(biz.id)?.public_slug ?? null,
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
    db.from('orders').select('total').gte('created_at', since30d),
  ]);

  const activeSubs = subs.filter((s: any) => s.status === 'active');
  const trialSubs  = subs.filter((s: any) => s.status === 'trial');
  const mrr        = activeSubs.reduce((acc: number, s: any) => acc + (Number(s.plan_price) || 0), 0);
  const revenue30d = (orders30d.data ?? []).reduce((acc: number, o: any) => acc + (Number(o.total) || 0), 0);

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

const EMPTY_CTO_STATS: CTOStats = {
  latency:            { p50: 0, p95: 0 },
  error_rate_1h:      0,
  total_events_24h:   0,
  total_errors_24h:   0,
  errors_by_category: {},
  top_errors:         [],
  alert_log:          [],
  db_health:          null,
  slow_queries:       [],
};

export async function getCTOStats(): Promise<CTOStats> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since1h  = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  try {
    const [vitals24hRes, alertLogRes, dbHealthRes] = await Promise.allSettled([
      db.from('monitoring_vitals')
        .select('category, level, latency_ms, message, created_at')
        .gte('created_at', since24h)
        .limit(2000),
      db.from('monitoring_alert_log')
        .select('rule_code, value, fired_at')
        .order('fired_at', { ascending: false })
        .limit(10),
      db.rpc('get_db_health'),
      // get_slow_queries omitted — requires pg_stat_statements extension (not available)
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
    const recent      = vitals.filter((v: any) => v.created_at >= since1h);
    const errorRate1h = recent.length > 0
      ? Math.round((recent.filter((v: any) => v.level === 'error').length / recent.length) * 100)
      : 0;

    // db_health: RPC may return a single object or an array with one row
    const rawDbHealth = dbHealthRes.status === 'fulfilled' ? (dbHealthRes.value.data ?? null) : null;
    const dbHealth: DbHealth | null = Array.isArray(rawDbHealth) ? (rawDbHealth[0] ?? null) : rawDbHealth;

    return {
      latency:            { p50, p95 },
      error_rate_1h:      errorRate1h,
      total_events_24h:   vitals.length,
      total_errors_24h:   vitals.filter((v: any) => v.level === 'error').length,
      errors_by_category: errorsByCategory,
      top_errors:         topErrors,
      alert_log:          alertLogRes.status === 'fulfilled' ? (alertLogRes.value.data ?? []) : [],
      db_health:          dbHealth,
      slow_queries:       [],
    };
  } catch (err) {
    console.error('[getCTOStats]', err);
    return EMPTY_CTO_STATS;
  }
}

// --- Sécurité ------------------------------------------------------------

export interface AuthFailureEvent {
  id:            string;
  message:       string;
  context:       any;
  created_at:    string;
  business_name?: string;
}

export interface SecurityStats {
  auth_failures_24h:      number;
  permission_denials_24h: number;
  recent_auth_failures:   AuthFailureEvent[];
  recent_auth_events:     { id: string; message: string; business_name: string | null; created_at: string; is_superadmin: boolean }[];
  top_probed_urls:        { url: string; count: number }[];
  suspicious_businesses:  { name: string; error_count: number }[];
  login_events_24h:       { event_name: string; count: number }[];
}

export async function getSecurityStats(): Promise<SecurityStats> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [authRes, apiRes] = await Promise.allSettled([
    // Tous les événements auth (login, logout, login_failed)
    db.from('monitoring_vitals')
      .select('id, message, level, context, created_at, businesses(name)')
      .eq('category', 'auth')
      .gte('created_at', since24h)
      .order('created_at', { ascending: false })
      .limit(200),

    // Erreurs API (pour détecter les 403 / probing)
    db.from('monitoring_vitals')
      .select('url, context, business_id, businesses(name)')
      .eq('category', 'api')
      .eq('level', 'error')
      .gte('created_at', since24h)
      .limit(500),
  ]);

  const allAuthEvents: any[] = authRes.status === 'fulfilled' ? (authRes.value.data ?? []) : [];
  const apiErrors:     any[] = apiRes.status  === 'fulfilled' ? (apiRes.value.data  ?? []) : [];

  // Separate client events (non-superadmin) for KPI counts
  const clientAuthEvents = allAuthEvents.filter((e: any) => !e.context?.is_superadmin);

  const authFailures = clientAuthEvents.filter((e: any) => e.level === 'error' || e.message === 'login_failed');

  // 403 uniquement
  const permDenials = apiErrors.filter((e: any) => e.context?.status === 403);

  // Top URLs sondées (403)
  const urlCounts: Record<string, number> = {};
  for (const e of permDenials) {
    const u = (e.url as string | null) ?? 'inconnue';
    urlCounts[u] = (urlCounts[u] ?? 0) + 1;
  }
  const topProbedUrls = Object.entries(urlCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([url, count]) => ({ url, count }));

  // Businesses avec erreurs anormalement élevées
  const bizCounts: Record<string, { name: string; count: number }> = {};
  for (const e of apiErrors) {
    if (!e.business_id) continue;
    const name = (e.businesses as any)?.name ?? e.business_id;
    const prev = bizCounts[e.business_id] ?? { name, count: 0 };
    bizCounts[e.business_id] = { name: prev.name, count: prev.count + 1 };
  }
  const suspiciousBiz = Object.values(bizCounts)
    .filter(b => b.count > 5)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map(({ name, count }) => ({ name, error_count: count }));

  // Comptage des événements auth par type — clients only (exclude superadmin)
  const eventCounts: Record<string, number> = {};
  for (const e of clientAuthEvents) {
    const key = e.message as string;
    eventCounts[key] = (eventCounts[key] ?? 0) + 1;
  }
  const loginEvents = Object.entries(eventCounts).map(([event_name, count]) => ({ event_name, count }));

  return {
    auth_failures_24h:      authFailures.length,
    permission_denials_24h: permDenials.length,
    recent_auth_failures:   authFailures.map((e: any) => ({
      id:            e.id,
      message:       e.message,
      context:       e.context,
      created_at:    e.created_at,
      business_name: (e.businesses as any)?.name ?? null,
    })),
    recent_auth_events:     allAuthEvents.slice(0, 50).map((e: any) => ({
      id:            e.id,
      message:       e.message,
      business_name: (e.businesses as any)?.name ?? null,
      created_at:    e.created_at,
      is_superadmin: e.context?.is_superadmin ?? false,
    })),
    top_probed_urls:        topProbedUrls,
    suspicious_businesses:  suspiciousBiz,
    login_events_24h:       loginEvents,
  };
}
