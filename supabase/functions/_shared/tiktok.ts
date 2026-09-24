// Client TikTok Marketing API (Business API v1.3).
//
// Particularités qui diffèrent de Meta et qui structurent ce fichier :
//  • toutes les réponses sont enveloppées dans { code, message, data } et un
//    code ≠ 0 accompagne un HTTP 200 — il faut donc inspecter le corps, pas le
//    statut ;
//  • le token vit dans l'en-tête `Access-Token`, pas dans les paramètres ;
//  • une annonce exige une « identité » de diffusion, créée une fois par
//    annonceur et réutilisée ensuite ;
//  • les budgets sont en unité majeure, à l'inverse de Meta.

import { majorToMinor, toTikTokBudget } from './money.ts';
import type { DailyMetric } from './meta.ts';

const APP_ID = Deno.env.get('TIKTOK_APP_ID') ?? '';
const APP_SECRET = Deno.env.get('TIKTOK_APP_SECRET') ?? '';
const BASE = 'https://business-api.tiktok.com/open_api/v1.3';

export class TikTokError extends Error {
  constructor(message: string, public code?: number, public isTokenExpired = false) {
    super(message);
  }
}

const TOKEN_ERROR_CODES = new Set([40100, 40105, 40110]);

export function tiktokAuthUrl(state: string, redirectUri: string): string {
  const p = new URLSearchParams({ app_id: APP_ID, state, redirect_uri: redirectUri });
  return `https://business-api.tiktok.com/portal/auth?${p}`;
}

async function call(
  path: string,
  opts: { token?: string; method?: 'GET' | 'POST'; params?: Record<string, unknown> } = {},
): Promise<Record<string, unknown>> {
  const { token, method = 'GET', params = {} } = opts;

  let url = `${BASE}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Access-Token'] = token;

  let body: string | undefined;
  if (method === 'GET') {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      q.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    const qs = q.toString();
    if (qs) url += `?${qs}`;
  } else {
    body = JSON.stringify(params);
  }

  const res = await fetch(url, { method, headers, body });
  const payload = await res.json().catch(() => ({})) as Record<string, unknown>;

  const code = Number(payload.code ?? -1);
  if (!res.ok || code !== 0) {
    const message = String(payload.message ?? `TikTok ${res.status}`);
    throw new TikTokError(message, code, TOKEN_ERROR_CODES.has(code));
  }
  return (payload.data ?? {}) as Record<string, unknown>;
}

// ─── OAuth ───────────────────────────────────────────────────────────────────

export async function exchangeCode(authCode: string): Promise<string> {
  const data = await call('/oauth2/access_token/', {
    method: 'POST',
    params: { app_id: APP_ID, secret: APP_SECRET, auth_code: authCode, grant_type: 'auth_code' },
  });
  return String(data.access_token);
}

export interface TikTokAdvertiser {
  advertiser_id:   string;
  advertiser_name: string;
  currency?:       string;
}

export async function listAdvertisers(token: string): Promise<TikTokAdvertiser[]> {
  const data = await call('/oauth2/advertiser/get/', {
    token,
    params: { app_id: APP_ID, secret: APP_SECRET },
  });
  const list = (data.list ?? []) as TikTokAdvertiser[];
  if (list.length === 0) return [];

  // Le premier appel ne renvoie pas la devise, qui conditionne pourtant tout le
  // calcul de budget : on la complète immédiatement.
  const info = await call('/advertiser/info/', {
    token,
    params: {
      advertiser_ids: list.map((a) => a.advertiser_id),
      fields:         ['advertiser_id', 'advertiser_name', 'currency'],
    },
  }).catch(() => ({ list: [] as TikTokAdvertiser[] }));

  const byId = new Map(
    ((info.list ?? []) as TikTokAdvertiser[]).map((a) => [a.advertiser_id, a.currency]),
  );
  return list.map((a) => ({ ...a, currency: byId.get(a.advertiser_id) ?? a.currency }));
}

/** Une annonce TikTok doit être publiée sous une identité : une par annonceur. */
export async function ensureIdentity(token: string, advertiserId: string, displayName: string): Promise<string> {
  const existing = await call('/identity/get/', {
    token,
    params: { advertiser_id: advertiserId, identity_type: 'CUSTOMIZED_USER' },
  }).catch(() => ({ identity_list: [] }));

  const list = (existing.identity_list ?? []) as Array<{ identity_id: string }>;
  if (list[0]?.identity_id) return list[0].identity_id;

  const created = await call('/identity/create/', {
    token,
    method: 'POST',
    params: { advertiser_id: advertiserId, display_name: displayName.slice(0, 40) },
  });
  return String(created.identity_id);
}

// ─── Création d'annonce ──────────────────────────────────────────────────────

export async function uploadAdImage(token: string, advertiserId: string, imageUrl: string): Promise<string> {
  const data = await call('/file/image/ad/upload/', {
    token,
    method: 'POST',
    params: { advertiser_id: advertiserId, upload_type: 'UPLOAD_BY_URL', image_url: imageUrl },
  });
  return String(data.image_id);
}

/** Résout un code pays ISO en identifiant de zone TikTok. */
export async function resolveLocationIds(
  token: string,
  advertiserId: string,
  countryCodes: string[],
): Promise<string[]> {
  const data = await call('/tool/region/get/', {
    token,
    params: { advertiser_id: advertiserId, objective_type: 'TRAFFIC' },
  });

  const regions = (data.region_info ?? data.list ?? []) as Array<Record<string, unknown>>;
  const wanted = new Set(countryCodes.map((c) => c.toUpperCase()));
  return regions
    .filter((r) => wanted.has(String(r.region_code ?? '').toUpperCase()))
    .map((r) => String(r.location_id ?? r.region_id));
}

export interface TikTokCampaignInput {
  advertiserId:     string;
  identityId:       string;
  name:             string;
  objectiveType:    string;
  optimizationGoal: string;
  billingEvent:     string;
  callToAction:     string;
  dailyBudgetMinor: number;
  currency:         string;
  startTime:        string;
  endTime?:         string | null;
  locationIds:      string[];
  ageRanges?:       string[];
  adText:           string;
  landingUrl:       string;
  imageId?:         string | null;
}

export interface TikTokCampaignIds {
  campaignId: string;
  adgroupId:  string;
  adId:       string;
}

export async function createCampaignStack(token: string, input: TikTokCampaignInput): Promise<TikTokCampaignIds> {
  const budget = toTikTokBudget(input.dailyBudgetMinor, input.currency);

  const campaign = await call('/campaign/create/', {
    token,
    method: 'POST',
    params: {
      advertiser_id:    input.advertiserId,
      campaign_name:    input.name,
      objective_type:   input.objectiveType,
      budget_mode:      'BUDGET_MODE_INFINITE',
      operation_status: 'DISABLE',
    },
  });
  const campaignId = String(campaign.campaign_id);

  const adgroup = await call('/adgroup/create/', {
    token,
    method: 'POST',
    params: {
      advertiser_id:       input.advertiserId,
      campaign_id:         campaignId,
      adgroup_name:        `${input.name} — audience`,
      promotion_type:      'WEBSITE',
      placement_type:      'PLACEMENT_TYPE_AUTOMATIC',
      location_ids:        input.locationIds,
      age_groups:          input.ageRanges,
      budget_mode:         'BUDGET_MODE_DAY',
      budget,
      schedule_type:       input.endTime ? 'SCHEDULE_START_END' : 'SCHEDULE_FROM_NOW',
      schedule_start_time: input.startTime,
      schedule_end_time:   input.endTime ?? undefined,
      optimization_goal:   input.optimizationGoal,
      billing_event:       input.billingEvent,
      bid_type:            'BID_TYPE_NO_BID',
      pacing:              'PACING_MODE_SMOOTH',
      identity_id:         input.identityId,
      identity_type:       'CUSTOMIZED_USER',
      operation_status:    'DISABLE',
    },
  });
  const adgroupId = String(adgroup.adgroup_id);

  const ad = await call('/ad/create/', {
    token,
    method: 'POST',
    params: {
      advertiser_id: input.advertiserId,
      adgroup_id:    adgroupId,
      creatives: [{
        ad_name:           input.name,
        ad_format:         'SINGLE_IMAGE',
        image_ids:         input.imageId ? [input.imageId] : undefined,
        ad_text:           input.adText,
        call_to_action:    input.callToAction,
        landing_page_url:  input.landingUrl,
        identity_id:       input.identityId,
        identity_type:     'CUSTOMIZED_USER',
        operation_status:  'DISABLE',
      }],
    },
  });

  const adIds = (ad.ad_ids ?? []) as string[];
  return { campaignId, adgroupId, adId: String(adIds[0] ?? '') };
}

export async function setStackStatus(
  token: string,
  advertiserId: string,
  ids: TikTokCampaignIds,
  status: 'ENABLE' | 'DISABLE' | 'DELETE',
): Promise<void> {
  if (ids.adId) {
    await call('/ad/status/update/', {
      token,
      method: 'POST',
      params: { advertiser_id: advertiserId, ad_ids: [ids.adId], operation_status: status },
    });
  }
  await call('/adgroup/status/update/', {
    token,
    method: 'POST',
    params: { advertiser_id: advertiserId, adgroup_ids: [ids.adgroupId], operation_status: status },
  });
  await call('/campaign/status/update/', {
    token,
    method: 'POST',
    params: { advertiser_id: advertiserId, campaign_ids: [ids.campaignId], operation_status: status },
  });
}

// ─── Résultats ───────────────────────────────────────────────────────────────

export async function fetchCampaignInsights(
  token: string,
  advertiserId: string,
  campaignId: string,
  since: string,
  until: string,
  currency: string,
): Promise<DailyMetric[]> {
  const data = await call('/report/integrated/get/', {
    token,
    params: {
      advertiser_id: advertiserId,
      report_type:   'BASIC',
      data_level:    'AUCTION_CAMPAIGN',
      dimensions:    ['campaign_id', 'stat_time_day'],
      metrics:       ['impressions', 'clicks', 'spend', 'reach', 'conversion'],
      filters:       [{ field_name: 'campaign_ids', filter_type: 'IN', filter_value: JSON.stringify([campaignId]) }],
      start_date:    since,
      end_date:      until,
      page_size:     200,
    },
  });

  const rows = (data.list ?? []) as Array<{
    dimensions?: Record<string, unknown>;
    metrics?:    Record<string, unknown>;
  }>;

  return rows.map((row) => {
    const m = row.metrics ?? {};
    const day = String(row.dimensions?.stat_time_day ?? '').slice(0, 10);
    return {
      date:        day,
      impressions: Number(m.impressions ?? 0),
      reach:       Number(m.reach ?? 0),
      clicks:      Number(m.clicks ?? 0),
      conversions: Number(m.conversion ?? 0),
      spendMinor:  majorToMinor(String(m.spend ?? '0'), currency),
    };
  }).filter((r) => r.date.length === 10);
}

export async function fetchCampaignStatus(
  token: string,
  advertiserId: string,
  campaignId: string,
): Promise<string> {
  const data = await call('/campaign/get/', {
    token,
    params: {
      advertiser_id: advertiserId,
      filtering:     { campaign_ids: [campaignId] },
      fields:        ['campaign_id', 'operation_status', 'secondary_status'],
    },
  });
  const list = (data.list ?? []) as Array<Record<string, unknown>>;
  return String(list[0]?.secondary_status ?? list[0]?.operation_status ?? 'UNKNOWN');
}
