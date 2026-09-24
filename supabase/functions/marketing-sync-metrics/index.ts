// Rapatrie les résultats des campagnes dans ad_metrics_daily.
//
// Deux déclencheurs :
//  • le cron quotidien (migration 153), qui présente le CRON_SECRET et traite
//    tous les business ;
//  • le bouton « Actualiser » de l'écran Marketing, qui présente un JWT et ne
//    traite que le business de l'appelant.
//
// La fenêtre couvre volontairement plusieurs jours : les plateformes
// consolident leurs chiffres a posteriori, une passe strictement quotidienne
// figerait des valeurs encore provisoires.

import { adminClient, requireCaller, HttpError } from '../_shared/auth.ts';
import { corsHeaders, json, preflight } from '../_shared/cors.ts';
import * as meta from '../_shared/meta.ts';
import * as tiktok from '../_shared/tiktok.ts';

const LOOKBACK_DAYS = 7;

function mapMetaStatus(effective: string): string | null {
  switch (effective) {
    case 'ACTIVE':            return 'active';
    case 'PAUSED':
    case 'CAMPAIGN_PAUSED':
    case 'ADSET_PAUSED':      return 'paused';
    case 'DELETED':
    case 'ARCHIVED':          return 'ended';
    case 'DISAPPROVED':       return 'rejected';
    default:                  return null;
  }
}

function mapTikTokStatus(status: string): string | null {
  if (status.includes('DELETE')) return 'ended';
  if (status.includes('DISABLE') || status.includes('SUSPEND')) return 'paused';
  if (status.includes('REJECT')) return 'rejected';
  if (status.includes('ENABLE') || status.includes('DELIVERY_OK')) return 'active';
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();

  try {
    const admin = adminClient();
    const cronSecret = Deno.env.get('CRON_SECRET');
    const authHeader = req.headers.get('Authorization') ?? '';
    const isCron = Boolean(cronSecret) && authHeader === `Bearer ${cronSecret}`;

    let businessFilter: string | null = null;
    if (!isCron) {
      const caller = await requireCaller(req, ['manager', 'admin', 'owner']);
      businessFilter = caller.businessId;
    }

    let query = admin
      .from('ad_campaigns')
      .select('id, business_id, platform, connection_id, external_campaign_id, currency, status')
      .not('external_campaign_id', 'is', null)
      .in('status', ['active', 'paused', 'publishing']);

    if (businessFilter) query = query.eq('business_id', businessFilter);

    const { data: campaigns } = await query;
    if (!campaigns?.length) return json({ synced: 0 });

    const connectionIds = [...new Set(campaigns.map((c) => c.connection_id).filter(Boolean))];
    const { data: connections } = await admin
      .from('ad_platform_connections')
      .select('id, platform, access_token, external_account_id, currency, status')
      .in('id', connectionIds);

    const byId = new Map((connections ?? []).map((c) => [c.id, c]));

    const until = new Date();
    const since = new Date(until.getTime() - LOOKBACK_DAYS * 86400000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    let synced = 0;
    const errors: Array<{ campaign: string; error: string }> = [];

    for (const campaign of campaigns) {
      const connection = byId.get(campaign.connection_id);
      if (!connection || connection.status === 'disconnected') continue;

      try {
        const currency = campaign.currency ?? connection.currency ?? 'XOF';

        const [metrics, platformStatus] = campaign.platform === 'meta'
          ? await Promise.all([
              meta.fetchCampaignInsights(
                connection.access_token, campaign.external_campaign_id, iso(since), iso(until), currency,
              ),
              meta.fetchCampaignStatus(connection.access_token, campaign.external_campaign_id),
            ])
          : await Promise.all([
              tiktok.fetchCampaignInsights(
                connection.access_token, connection.external_account_id,
                campaign.external_campaign_id, iso(since), iso(until), currency,
              ),
              tiktok.fetchCampaignStatus(
                connection.access_token, connection.external_account_id, campaign.external_campaign_id,
              ),
            ]);

        if (metrics.length > 0) {
          await admin.from('ad_metrics_daily').upsert(
            metrics.map((m) => ({
              business_id: campaign.business_id,
              campaign_id: campaign.id,
              date:        m.date,
              impressions: m.impressions,
              reach:       m.reach,
              clicks:      m.clicks,
              conversions: m.conversions,
              spend_minor: m.spendMinor,
              currency,
            })),
            { onConflict: 'campaign_id,date' },
          );
        }

        const mapped = campaign.platform === 'meta'
          ? mapMetaStatus(platformStatus)
          : mapTikTokStatus(platformStatus);

        await admin.from('ad_campaigns').update({
          status:         mapped ?? campaign.status,
          last_synced_at: new Date().toISOString(),
        }).eq('id', campaign.id);

        synced++;
      } catch (e) {
        const err = e as Error & { isTokenExpired?: boolean };

        if (err.isTokenExpired) {
          await admin.from('ad_platform_connections').update({
            status:          'token_expired',
            last_error:      err.message,
            last_checked_at: new Date().toISOString(),
          }).eq('id', connection.id);
        }
        errors.push({ campaign: campaign.id, error: err.message });
      }
    }

    // Les états OAuth périmés ne servent plus à rien : on profite du passage.
    await admin.from('ad_oauth_states').delete().lt('expires_at', new Date().toISOString());

    return json({ synced, errors });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
