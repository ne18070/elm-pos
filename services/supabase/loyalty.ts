import { supabase as _supabase } from './client';
const db = _supabase as any;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LoyaltyConfig {
  business_id:  string;
  is_active:    boolean;
  earn_per:     number;   // 1 point per earn_per CFA spent
  point_value:  number;   // 1 point = point_value CFA when redeeming
  min_redeem:   number;   // minimum points required to redeem
}

export interface LoyaltyTransaction {
  id:               string;
  business_id:      string;
  client_name:      string;
  client_phone:     string | null;
  type:             'earn' | 'redeem' | 'expire' | 'adjust';
  points:           number;
  order_amount:     number | null;
  service_order_id: string | null;
  order_id:         string | null;
  note:             string | null;
  expires_at:       string | null;
  created_at:       string;
}

export interface ClientLoyalty {
  client_name:    string;
  client_phone:   string | null;
  balance:        number;   // spendable points (earns minus redeems, expired excluded)
  total_earned:   number;   // lifetime points earned
  total_redeemed: number;   // lifetime points redeemed
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: Omit<LoyaltyConfig, 'business_id'> = {
  is_active:   false,  // OFF jusqu'à activation explicite par le business
  earn_per:    1000,   // 1 pt per 1 000 CFA → 0.5% effective discount at point_value=5
  point_value: 5,      // 1 pt = 5 CFA
  min_redeem:  100,    // need 100 pts minimum (= 500 CFA)
};

// Next December 31 expiry — points earned this year expire end of NEXT year
function nextDecember31(): string {
  const d = new Date();
  const year = d.getMonth() >= 11 ? d.getFullYear() + 1 : d.getFullYear() + 1;
  return `${year}-12-31`;
}

// ── Config ────────────────────────────────────────────────────────────────────

export async function getLoyaltyConfig(businessId: string): Promise<LoyaltyConfig> {
  const { data } = await db
    .from('loyalty_config')
    .select('*')
    .eq('business_id', businessId)
    .maybeSingle();
  return data ?? { business_id: businessId, ...DEFAULT_CONFIG };
}

export async function saveLoyaltyConfig(config: LoyaltyConfig): Promise<void> {
  const { error } = await db
    .from('loyalty_config')
    .upsert({ ...config, updated_at: new Date().toISOString() }, { onConflict: 'business_id' });
  if (error) throw new Error(error.message);
}

// ── Earn ──────────────────────────────────────────────────────────────────────

export async function earnPoints(
  businessId:      string,
  clientName:      string,
  clientPhone:     string | null,
  orderAmount:     number,
  config:          LoyaltyConfig,
  serviceOrderId?: string,
  orderId?:        string,
): Promise<number> {
  if (!config.is_active) return 0;
  const points = Math.floor(orderAmount / config.earn_per);
  if (points <= 0) return 0;

  const { error } = await db.from('loyalty_transactions').insert({
    business_id:      businessId,
    client_name:      clientName.trim(),
    client_phone:     clientPhone ?? null,
    type:             'earn',
    points,
    order_amount:     orderAmount,
    service_order_id: serviceOrderId ?? null,
    order_id:         orderId ?? null,
    note:             `Achat ${orderAmount.toLocaleString('fr-FR')} CFA`,
    expires_at:       nextDecember31(),
  });
  if (error) throw new Error(error.message);
  return points;
}

// ── Redeem ────────────────────────────────────────────────────────────────────

export async function redeemPoints(
  businessId:      string,
  clientName:      string,
  clientPhone:     string | null,
  points:          number,
  config:          LoyaltyConfig,
  serviceOrderId?: string,
  orderId?:        string,
): Promise<{ pointsUsed: number; cashValue: number }> {
  const balance = await getClientBalance(businessId, clientName);
  const toUse   = Math.min(points, balance);

  if (toUse < config.min_redeem) {
    throw new Error(`Minimum ${config.min_redeem} pts requis (solde : ${balance} pts)`);
  }

  const cashValue = toUse * config.point_value;

  const { error } = await db.from('loyalty_transactions').insert({
    business_id:      businessId,
    client_name:      clientName.trim(),
    client_phone:     clientPhone ?? null,
    type:             'redeem',
    points:           -toUse,
    service_order_id: serviceOrderId ?? null,
    order_id:         orderId ?? null,
    note:             `Remise ${cashValue.toLocaleString('fr-FR')} CFA`,
  });
  if (error) throw new Error(error.message);
  return { pointsUsed: toUse, cashValue };
}

// ── Balance ───────────────────────────────────────────────────────────────────

export async function getClientBalance(businessId: string, clientName: string): Promise<number> {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await db
    .from('loyalty_transactions')
    .select('points, type, expires_at')
    .eq('business_id', businessId)
    .ilike('client_name', clientName.trim());

  if (!data) return 0;
  return (data as LoyaltyTransaction[]).reduce((sum, row) => {
    // Skip expired earn rows (expired_at < today)
    if (row.type === 'earn' && row.expires_at && row.expires_at < today) return sum;
    return sum + row.points;
  }, 0);
}

// ── Client history ────────────────────────────────────────────────────────────

export async function getClientLoyaltyHistory(
  businessId:  string,
  clientName:  string,
): Promise<LoyaltyTransaction[]> {
  const { data, error } = await db
    .from('loyalty_transactions')
    .select('*')
    .eq('business_id', businessId)
    .ilike('client_name', clientName.trim())
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ── All clients (for ranking table) ──────────────────────────────────────────

export async function getAllClientsLoyalty(businessId: string): Promise<ClientLoyalty[]> {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await db
    .from('loyalty_transactions')
    .select('client_name, client_phone, points, type, expires_at')
    .eq('business_id', businessId);
  if (error) throw new Error(error.message);

  const map = new Map<string, ClientLoyalty>();
  for (const row of (data ?? []) as LoyaltyTransaction[]) {
    const key = row.client_name.toLowerCase().trim();
    let e = map.get(key);
    if (!e) {
      e = { client_name: row.client_name, client_phone: row.client_phone, balance: 0, total_earned: 0, total_redeemed: 0 };
      map.set(key, e);
    }
    const expired = row.type === 'earn' && !!row.expires_at && row.expires_at < today;
    if (!expired) e.balance += row.points;
    if (row.type === 'earn')   e.total_earned   += row.points;
    if (row.type === 'redeem') e.total_redeemed += Math.abs(row.points);
  }
  return Array.from(map.values());
}
