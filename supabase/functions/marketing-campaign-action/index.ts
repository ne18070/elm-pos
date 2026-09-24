// Met en pause, relance ou arrête une publicité, sur les deux plateformes à la
// fois quand elle y a été publiée.

import { adminClient, requireCaller, HttpError } from '../_shared/auth.ts';
import { corsHeaders, json, preflight } from '../_shared/cors.ts';
import * as meta from '../_shared/meta.ts';
import * as tiktok from '../_shared/tiktok.ts';

type Action = 'pause' | 'resume' | 'stop';

const NEXT_STATUS: Record<Action, string> = {
  pause:  'paused',
  resume: 'active',
  stop:   'ended',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();

  try {
    const caller = await requireCaller(req);
    const { campaign_group_id, action } = await req.json() as {
      campaign_group_id: string;
      action: Action;
    };

    if (!['pause', 'resume', 'stop'].includes(action)) {
      throw new HttpError(400, 'Action inconnue');
    }
    if (!campaign_group_id) throw new HttpError(400, 'Publicité non précisée');

    const admin = adminClient();

    const { data: campaigns } = await admin
      .from('ad_campaigns')
      .select('id, platform, connection_id, external_campaign_id, external_adset_id, external_ad_id, status')
      .eq('business_id', caller.businessId)
      .eq('campaign_group_id', campaign_group_id);

    if (!campaigns?.length) throw new HttpError(404, 'Publicité introuvable');

    const connectionIds = [...new Set(campaigns.map((c) => c.connection_id).filter(Boolean))];
    const { data: connections } = await admin
      .from('ad_platform_connections')
      .select('id, platform, access_token, external_account_id')
      .in('id', connectionIds);

    const byId = new Map((connections ?? []).map((c) => [c.id, c]));
    const results: Array<{ platform: string; ok: boolean; error?: string }> = [];

    for (const campaign of campaigns) {
      const connection = byId.get(campaign.connection_id);
      if (!connection || !campaign.external_campaign_id) {
        // Une campagne qui n'a jamais atteint la plateforme (échec de
        // publication) n'a rien à y modifier : on aligne juste l'état local.
        await admin.from('ad_campaigns')
          .update({ status: NEXT_STATUS[action] })
          .eq('id', campaign.id);
        continue;
      }

      try {
        if (campaign.platform === 'meta') {
          const ids = {
            campaignId: campaign.external_campaign_id,
            adsetId:    campaign.external_adset_id ?? '',
            adId:       campaign.external_ad_id ?? '',
          };
          if (action === 'stop') {
            await meta.deleteCampaign(connection.access_token, ids.campaignId);
          } else {
            await meta.setStackStatus(
              connection.access_token,
              ids,
              action === 'resume' ? 'ACTIVE' : 'PAUSED',
            );
          }
        } else {
          const ids = {
            campaignId: campaign.external_campaign_id,
            adgroupId:  campaign.external_adset_id ?? '',
            adId:       campaign.external_ad_id ?? '',
          };
          const status = action === 'resume' ? 'ENABLE' : action === 'stop' ? 'DELETE' : 'DISABLE';
          await tiktok.setStackStatus(
            connection.access_token,
            connection.external_account_id,
            ids,
            status,
          );
        }

        await admin.from('ad_campaigns')
          .update({ status: NEXT_STATUS[action], error_message: null })
          .eq('id', campaign.id);

        results.push({ platform: campaign.platform, ok: true });
      } catch (e) {
        const err = e as Error & { isTokenExpired?: boolean };

        if (err.isTokenExpired) {
          await admin.from('ad_platform_connections')
            .update({ status: 'token_expired', last_error: err.message })
            .eq('id', connection.id);
        }
        await admin.from('ad_campaigns')
          .update({ error_message: err.message })
          .eq('id', campaign.id);

        results.push({ platform: campaign.platform, ok: false, error: err.message });
      }
    }

    return json({ results });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
