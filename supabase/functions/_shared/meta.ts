// Client Meta Marketing API (Facebook / Instagram).
//
// Les formes de payload suivent la documentation Graph : paramètres en
// form-urlencoded, structures imbriquées sérialisées en JSON. Les endpoints et
// noms de champs sont à re-vérifier contre le compte de test avant la mise en
// production — c'est le passage obligé de toute intégration Marketing API, la
// version de l'API évoluant plusieurs fois par an.

import { majorToMinor } from './money.ts';

const VERSION = Deno.env.get('META_GRAPH_VERSION') ?? 'v25.0';
const APP_ID = Deno.env.get('META_APP_ID') ?? '';
const APP_SECRET = Deno.env.get('META_APP_SECRET') ?? '';

const GRAPH = `https://graph.facebook.com/${VERSION}`;

export const META_SCOPES = [
  'ads_management',
  'ads_read',
  'business_management',
  'pages_show_list',
  'pages_read_engagement',
].join(',');

export class MetaError extends Error {
  constructor(message: string, public code?: number, public isTokenExpired = false) {
    super(message);
  }
}

export function metaAuthUrl(state: string, redirectUri: string): string {
  const p = new URLSearchParams({
    client_id:     APP_ID,
    redirect_uri:  redirectUri,
    state,
    response_type: 'code',
    scope:         META_SCOPES,
  });
  return `https://www.facebook.com/${VERSION}/dialog/oauth?${p}`;
}

async function call(
  path: string,
  opts: { token?: string; method?: 'GET' | 'POST'; params?: Record<string, unknown> } = {},
): Promise<Record<string, unknown>> {
  const { token, method = 'GET', params = {} } = opts;

  const flat = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    flat.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  if (token) flat.set('access_token', token);

  const url = method === 'GET' ? `${GRAPH}${path}?${flat}` : `${GRAPH}${path}`;
  const res = await fetch(url, {
    method,
    headers: method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {},
    body:    method === 'POST' ? flat.toString() : undefined,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (body as { error?: { message?: string; code?: number } }).error;
    // 190 = token expiré ou révoqué : le seul cas qui impose de redemander une
    // connexion au commerçant plutôt que de réessayer.
    throw new MetaError(err?.message ?? `Meta ${res.status}`, err?.code, err?.code === 190);
  }
  return body as Record<string, unknown>;
}

// ─── OAuth ───────────────────────────────────────────────────────────────────

export async function exchangeCode(code: string, redirectUri: string): Promise<string> {
  const r = await call('/oauth/access_token', {
    params: { client_id: APP_ID, client_secret: APP_SECRET, redirect_uri: redirectUri, code },
  });
  return String(r.access_token);
}

/** Le token du flux OAuth est court ; on l'échange contre un token ~60 jours. */
export async function toLongLivedToken(shortToken: string): Promise<{ token: string; expiresIn: number }> {
  const r = await call('/oauth/access_token', {
    params: {
      grant_type:       'fb_exchange_token',
      client_id:        APP_ID,
      client_secret:    APP_SECRET,
      fb_exchange_token: shortToken,
    },
  });
  return { token: String(r.access_token), expiresIn: Number(r.expires_in ?? 5184000) };
}

export interface MetaAdAccount {
  id:             string;
  account_id:     string;
  name:           string;
  currency:       string;
  account_status: number;
  min_daily_budget?: number;
}

export async function listAdAccounts(token: string): Promise<MetaAdAccount[]> {
  const r = await call('/me/adaccounts', {
    token,
    params: { fields: 'id,account_id,name,currency,account_status,min_daily_budget', limit: 100 },
  });
  return ((r.data ?? []) as MetaAdAccount[]);
}

export interface MetaPage {
  id:   string;
  name: string;
  instagram_business_account?: { id: string };
}

export async function listPages(token: string): Promise<MetaPage[]> {
  const r = await call('/me/accounts', {
    token,
    params: { fields: 'id,name,instagram_business_account{id}', limit: 100 },
  });
  return ((r.data ?? []) as MetaPage[]);
}

// ─── Création d'annonce ──────────────────────────────────────────────────────

/** Meta veut l'image dans son propre stockage : on relaie l'URL publique du produit. */
export async function uploadAdImage(token: string, accountId: string, imageUrl: string): Promise<string> {
  const img = await fetch(imageUrl);
  if (!img.ok) throw new MetaError(`Image inaccessible (${img.status})`);

  const buf = new Uint8Array(await img.arrayBuffer());
  let binary = '';
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);

  const r = await call(`/act_${accountId}/adimages`, {
    token,
    method: 'POST',
    params: { bytes: btoa(binary) },
  });

  const images = (r.images ?? {}) as Record<string, { hash?: string }>;
  const first = Object.values(images)[0];
  if (!first?.hash) throw new MetaError('Meta n\'a pas renvoyé de hash d\'image');
  return first.hash;
}

export interface MetaCampaignInput {
  accountId:        string;
  pageId:           string;
  instagramActorId?: string | null;
  pixelId?:         string | null;
  name:             string;
  objective:        string;
  optimizationGoal: string;
  billingEvent:     string;
  callToAction:     string;
  dailyBudget:      string;
  startTime:        string;
  endTime?:         string | null;
  targeting:        Record<string, unknown>;
  headline:         string;
  body:             string;
  linkUrl:          string;
  imageHash?:       string | null;
}

export interface MetaCampaignIds {
  campaignId: string;
  adsetId:    string;
  adId:       string;
}

/**
 * Crée la hiérarchie complète Campagne → Ad Set → Créa → Annonce.
 * Tout naît en PAUSED : tant que les quatre étapes n'ont pas abouti, aucune
 * diffusion n'est possible et donc aucun budget n'est consommé.
 */
export async function createCampaignStack(token: string, input: MetaCampaignInput): Promise<MetaCampaignIds> {
  const act = `/act_${input.accountId}`;

  const campaign = await call(`${act}/campaigns`, {
    token,
    method: 'POST',
    params: {
      name:                  input.name,
      objective:             input.objective,
      status:                'PAUSED',
      special_ad_categories: [],
    },
  });
  const campaignId = String(campaign.id);

  const promotedObject = input.pixelId && input.optimizationGoal === 'OFFSITE_CONVERSIONS'
    ? { pixel_id: input.pixelId, custom_event_type: 'PURCHASE' }
    : undefined;

  const adset = await call(`${act}/adsets`, {
    token,
    method: 'POST',
    params: {
      name:              `${input.name} — audience`,
      campaign_id:       campaignId,
      daily_budget:      input.dailyBudget,
      billing_event:     input.billingEvent,
      optimization_goal: input.optimizationGoal,
      bid_strategy:      'LOWEST_COST_WITHOUT_CAP',
      targeting:         input.targeting,
      start_time:        input.startTime,
      end_time:          input.endTime ?? undefined,
      promoted_object:   promotedObject,
      status:            'PAUSED',
    },
  });
  const adsetId = String(adset.id);

  const linkData: Record<string, unknown> = {
    link:    input.linkUrl,
    message: input.body,
    name:    input.headline,
    call_to_action: { type: input.callToAction, value: { link: input.linkUrl } },
  };
  if (input.imageHash) linkData.image_hash = input.imageHash;

  const storySpec: Record<string, unknown> = { page_id: input.pageId, link_data: linkData };
  if (input.instagramActorId) storySpec.instagram_actor_id = input.instagramActorId;

  const creative = await call(`${act}/adcreatives`, {
    token,
    method: 'POST',
    params: { name: `${input.name} — créa`, object_story_spec: storySpec },
  });

  const ad = await call(`${act}/ads`, {
    token,
    method: 'POST',
    params: {
      name:     input.name,
      adset_id: adsetId,
      creative: { creative_id: String(creative.id) },
      status:   'PAUSED',
    },
  });

  return { campaignId, adsetId, adId: String(ad.id) };
}

/** Une hiérarchie ne diffuse que si ses trois niveaux sont actifs. */
export async function setStackStatus(
  token: string,
  ids: MetaCampaignIds,
  status: 'ACTIVE' | 'PAUSED',
): Promise<void> {
  for (const id of [ids.adId, ids.adsetId, ids.campaignId]) {
    await call(`/${id}`, { token, method: 'POST', params: { status } });
  }
}

export async function deleteCampaign(token: string, campaignId: string): Promise<void> {
  await call(`/${campaignId}`, { token, method: 'POST', params: { status: 'DELETED' } });
}

// ─── Résultats ───────────────────────────────────────────────────────────────

export interface DailyMetric {
  date:        string;
  impressions: number;
  reach:       number;
  clicks:      number;
  conversions: number;
  spendMinor:  number;
}

const PURCHASE_ACTIONS = new Set([
  'purchase',
  'offsite_conversion.fb_pixel_purchase',
  'omni_purchase',
]);

export async function fetchCampaignInsights(
  token: string,
  campaignId: string,
  since: string,
  until: string,
  currency: string,
): Promise<DailyMetric[]> {
  const r = await call(`/${campaignId}/insights`, {
    token,
    params: {
      time_increment: 1,
      time_range:     { since, until },
      fields:         'date_start,impressions,reach,clicks,spend,actions',
      limit:          500,
    },
  });

  const rows = (r.data ?? []) as Array<Record<string, unknown>>;
  return rows.map((row) => {
    const actions = (row.actions ?? []) as Array<{ action_type: string; value: string }>;
    const conversions = actions
      .filter((a) => PURCHASE_ACTIONS.has(a.action_type))
      .reduce((sum, a) => sum + Number(a.value ?? 0), 0);

    return {
      date:        String(row.date_start),
      impressions: Number(row.impressions ?? 0),
      reach:       Number(row.reach ?? 0),
      clicks:      Number(row.clicks ?? 0),
      conversions,
      // `spend` est renvoyé en unité majeure (« 12.34 ») dans la devise du compte.
      spendMinor:  majorToMinor(String(row.spend ?? '0'), currency),
    };
  });
}

export async function fetchCampaignStatus(token: string, campaignId: string): Promise<string> {
  const r = await call(`/${campaignId}`, { token, params: { fields: 'effective_status' } });
  return String(r.effective_status ?? 'UNKNOWN');
}
