import { supabase } from './client';

// --- Types --------------------------------------------------------------------

export type AdPlatform = 'meta' | 'tiktok';
export type AdObjective = 'ventes' | 'visibilite' | 'messages';
export type AdConnectionStatus =
  | 'needs_account_selection' | 'connected' | 'token_expired' | 'disconnected';
export type AdCampaignStatus =
  | 'draft' | 'publishing' | 'active' | 'paused' | 'ended' | 'failed' | 'rejected';

/** Comptes et Pages proposés par la plateforme, à trancher quand il y en a plusieurs. */
export interface AvailableAccounts {
  accounts?: Array<{ account_id: string; name?: string; currency?: string }>;
  pages?:    Array<{ id: string; name?: string }>;
  advertisers?: Array<{ advertiser_id: string; advertiser_name?: string; currency?: string }>;
}

export interface AdConnection {
  id:                     string;
  business_id:            string;
  platform:               AdPlatform;
  external_account_id:    string | null;
  external_account_name:  string | null;
  currency:               string;
  min_daily_budget_minor: number | null;
  page_id:                string | null;
  page_name:              string | null;
  instagram_actor_id:     string | null;
  pixel_id:               string | null;
  identity_id:            string | null;
  available_accounts:     AvailableAccounts | null;
  status:                 AdConnectionStatus;
  last_error:             string | null;
  last_checked_at:        string | null;
  created_at:             string;
  updated_at:             string;
}

export interface AdCampaign {
  id:                   string;
  business_id:          string;
  campaign_group_id:    string;
  platform:             AdPlatform;
  name:                 string;
  objective:            AdObjective;
  status:               AdCampaignStatus;
  product_id:           string | null;
  daily_budget_minor:   number;
  currency:             string;
  start_date:           string;
  end_date:             string | null;
  landing_url:          string | null;
  creative:             { headline?: string; body?: string; image_url?: string | null };
  external_campaign_id: string | null;
  error_message:        string | null;
  last_synced_at:       string | null;
  created_at:           string;
}

export interface AdMetrics {
  impressions: number;
  reach:       number;
  clicks:      number;
  conversions: number;
  spendMinor:  number;
}

export interface AdMetricDay extends AdMetrics {
  date: string;
}

/** Une soumission de l'assistant : la même publicité sur une ou deux plateformes. */
export interface AdCampaignGroup {
  groupId:   string;
  name:      string;
  objective: AdObjective;
  status:    AdCampaignStatus;
  currency:  string;
  startDate: string;
  endDate:   string | null;
  creative:  AdCampaign['creative'];
  platforms: AdPlatform[];
  campaigns: AdCampaign[];
  totals:    AdMetrics;
}

export interface PublishCampaignInput {
  platforms:          AdPlatform[];
  objective:          AdObjective;
  name:               string;
  headline:           string;
  body:               string;
  landing_url:        string;
  image_url?:         string | null;
  product_id?:        string | null;
  daily_budget_minor: number;
  start_date:         string;
  end_date?:          string | null;
  countries?:         string[];
  age_min?:           number;
  age_max?:           number;
}

export interface PublishResult {
  campaign_group_id: string;
  results: Array<{ platform: AdPlatform; ok: boolean; error?: string }>;
}

// Les montants sont stockés en unité mineure (voir migration 152). Le XOF n'a
// pas de décimales, contrairement à l'euro : diviser systématiquement par 100
// afficherait 50 € là où le commerçant a budgété 5 000 FCFA.
const ZERO_DECIMAL_CURRENCIES = new Set([
  'XOF', 'XAF', 'BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY',
  'KMF', 'KRW', 'PYG', 'RWF', 'UGX', 'VND', 'VUV',
]);

export function minorToMajor(minor: number, currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? minor : minor / 100;
}

export function majorToMinor(major: number, currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase())
    ? Math.round(major)
    : Math.round(major * 100);
}

// `access_token` et `refresh_token` ne sont pas accordés au rôle `authenticated`
// (migration 152) : un `select('*')` échouerait avec « permission denied ».
// Cette liste est donc la seule projection valide côté client.
const CONNECTION_COLUMNS = `
  id, business_id, platform,
  external_account_id, external_account_name, currency, min_daily_budget_minor,
  page_id, page_name, instagram_actor_id, pixel_id, identity_id,
  status, last_error, last_checked_at, created_at, updated_at
`;

// --- Connexions ---------------------------------------------------------------

export async function getAdConnections(businessId: string): Promise<AdConnection[]> {
  const { data, error } = await supabase
    .from('ad_platform_connections')
    .select(CONNECTION_COLUMNS)
    .eq('business_id', businessId);

  if (error) throw error;
  return (data ?? []) as unknown as AdConnection[];
}

/**
 * Renvoie l'URL d'autorisation de la plateforme. L'appelant redirige lui-même :
 * en Electron et sur mobile, l'ouverture doit se faire dans le navigateur
 * système, pas dans la fenêtre de l'app.
 */
export async function startPlatformConnect(
  platform: AdPlatform,
  returnOrigin: string,
): Promise<string> {
  const { data, error } = await supabase.functions.invoke('marketing-oauth-start', {
    body: { platform, return_origin: returnOrigin },
  });
  if (error) throw error;
  return (data as { url: string }).url;
}

export async function selectAdAccount(
  platform: AdPlatform,
  accountId: string,
  pageId?: string,
): Promise<void> {
  const { error } = await supabase.functions.invoke('marketing-select-account', {
    body: { platform, account_id: accountId, page_id: pageId },
  });
  if (error) throw error;
}

// --- Campagnes ----------------------------------------------------------------

const EMPTY_TOTALS: AdMetrics = {
  impressions: 0, reach: 0, clicks: 0, conversions: 0, spendMinor: 0,
};

function sumMetrics(rows: Array<Record<string, unknown>>): AdMetrics {
  return rows.reduce<AdMetrics>((acc, r) => ({
    impressions: acc.impressions + Number(r.impressions ?? 0),
    reach:       acc.reach       + Number(r.reach ?? 0),
    clicks:      acc.clicks      + Number(r.clicks ?? 0),
    conversions: acc.conversions + Number(r.conversions ?? 0),
    spendMinor:  acc.spendMinor  + Number(r.spend_minor ?? 0),
  }), { ...EMPTY_TOTALS });
}

/**
 * Statut affiché pour un groupe publié sur deux plateformes : on montre le cas
 * le plus engageant (une diffusion en cours prime sur un échec de l'autre côté),
 * pour ne pas laisser croire que rien ne tourne.
 */
function groupStatus(campaigns: AdCampaign[]): AdCampaignStatus {
  const order: AdCampaignStatus[] = [
    'active', 'publishing', 'paused', 'rejected', 'failed', 'ended', 'draft',
  ];
  for (const status of order) {
    if (campaigns.some((c) => c.status === status)) return status;
  }
  return 'draft';
}

export async function getCampaignGroups(businessId: string): Promise<AdCampaignGroup[]> {
  const { data: campaigns, error } = await supabase
    .from('ad_campaigns')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  const rows = (campaigns ?? []) as unknown as AdCampaign[];
  if (rows.length === 0) return [];

  const { data: metrics } = await supabase
    .from('ad_metrics_daily')
    .select('campaign_id, impressions, reach, clicks, conversions, spend_minor')
    .in('campaign_id', rows.map((c) => c.id));

  const metricsByCampaign = new Map<string, Array<Record<string, unknown>>>();
  for (const m of (metrics ?? []) as Array<Record<string, unknown>>) {
    const key = String(m.campaign_id);
    const list = metricsByCampaign.get(key) ?? [];
    list.push(m);
    metricsByCampaign.set(key, list);
  }

  const groups = new Map<string, AdCampaign[]>();
  for (const c of rows) {
    const list = groups.get(c.campaign_group_id) ?? [];
    list.push(c);
    groups.set(c.campaign_group_id, list);
  }

  return [...groups.entries()].map(([groupId, list]) => {
    const head = list[0];
    const allMetrics = list.flatMap((c) => metricsByCampaign.get(c.id) ?? []);
    return {
      groupId,
      name:      head.name,
      objective: head.objective,
      status:    groupStatus(list),
      currency:  head.currency,
      startDate: head.start_date,
      endDate:   head.end_date,
      creative:  head.creative ?? {},
      platforms: list.map((c) => c.platform),
      campaigns: list,
      totals:    sumMetrics(allMetrics),
    };
  });
}

export async function getCampaignGroup(
  businessId: string,
  groupId: string,
): Promise<{ group: AdCampaignGroup; daily: AdMetricDay[] } | null> {
  const { data, error } = await supabase
    .from('ad_campaigns')
    .select('*')
    .eq('business_id', businessId)
    .eq('campaign_group_id', groupId);

  if (error) throw error;
  const campaigns = (data ?? []) as unknown as AdCampaign[];
  if (campaigns.length === 0) return null;

  const { data: metrics } = await supabase
    .from('ad_metrics_daily')
    .select('date, impressions, reach, clicks, conversions, spend_minor')
    .in('campaign_id', campaigns.map((c) => c.id))
    .order('date');

  const rows = (metrics ?? []) as Array<Record<string, unknown>>;

  // Deux plateformes peuvent rapporter la même journée : on additionne.
  const byDate = new Map<string, AdMetricDay>();
  for (const r of rows) {
    const date = String(r.date);
    const acc = byDate.get(date) ?? { date, ...EMPTY_TOTALS };
    byDate.set(date, {
      date,
      impressions: acc.impressions + Number(r.impressions ?? 0),
      reach:       acc.reach       + Number(r.reach ?? 0),
      clicks:      acc.clicks      + Number(r.clicks ?? 0),
      conversions: acc.conversions + Number(r.conversions ?? 0),
      spendMinor:  acc.spendMinor  + Number(r.spend_minor ?? 0),
    });
  }

  const head = campaigns[0];
  return {
    group: {
      groupId,
      name:      head.name,
      objective: head.objective,
      status:    groupStatus(campaigns),
      currency:  head.currency,
      startDate: head.start_date,
      endDate:   head.end_date,
      creative:  head.creative ?? {},
      platforms: campaigns.map((c) => c.platform),
      campaigns,
      totals:    sumMetrics(rows),
    },
    daily: [...byDate.values()],
  };
}

export async function publishCampaign(input: PublishCampaignInput): Promise<PublishResult> {
  const { data, error } = await supabase.functions.invoke('marketing-campaign-publish', {
    body: input,
  });
  if (error) throw error;
  return data as PublishResult;
}

export async function setCampaignAction(
  groupId: string,
  action: 'pause' | 'resume' | 'stop',
): Promise<void> {
  const { error } = await supabase.functions.invoke('marketing-campaign-action', {
    body: { campaign_group_id: groupId, action },
  });
  if (error) throw error;
}

export async function refreshCampaignMetrics(): Promise<void> {
  const { error } = await supabase.functions.invoke('marketing-sync-metrics', { body: {} });
  if (error) throw error;
}
