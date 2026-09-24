// Publie une même publicité sur les plateformes choisies.
//
// Chaque plateforme donne lieu à une ligne ad_campaigns, regroupées par
// campaign_group_id : l'échec d'un côté n'empêche pas la diffusion de l'autre,
// et l'UI présente malgré tout « une publicité ».

import { adminClient, requireCaller, HttpError } from '../_shared/auth.ts';
import { corsHeaders, json, preflight } from '../_shared/cors.ts';
import { isObjective, metaSpec, tiktokSpec, type Objective } from '../_shared/objectives.ts';
import { toMetaBudget } from '../_shared/money.ts';
import * as meta from '../_shared/meta.ts';
import * as tiktok from '../_shared/tiktok.ts';

interface PublishBody {
  platforms:          Array<'meta' | 'tiktok'>;
  objective:          Objective;
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

const TIKTOK_AGE_GROUPS = [
  { group: 'AGE_13_17', min: 13, max: 17 },
  { group: 'AGE_18_24', min: 18, max: 24 },
  { group: 'AGE_25_34', min: 25, max: 34 },
  { group: 'AGE_35_44', min: 35, max: 44 },
  { group: 'AGE_45_54', min: 45, max: 54 },
  { group: 'AGE_55_100', min: 55, max: 100 },
];

function tiktokAgeGroups(min: number, max: number): string[] {
  return TIKTOK_AGE_GROUPS.filter((g) => g.max >= min && g.min <= max).map((g) => g.group);
}

/**
 * Meta refuse une campagne dont le début est déjà passé. Si le commerçant a
 * choisi « aujourd'hui », on décale de quelques minutes plutôt que de lui
 * renvoyer une erreur qu'il ne saurait pas corriger.
 */
function startInstant(startDate: string): Date {
  const requested = new Date(`${startDate}T00:00:00Z`);
  const soon = new Date(Date.now() + 10 * 60 * 1000);
  return requested > soon ? requested : soon;
}

function assertSafeUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new HttpError(400, 'Lien de destination invalide');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new HttpError(400, 'Lien de destination invalide');
  }
  return parsed.toString();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();

  try {
    const caller = await requireCaller(req);
    const input = await req.json() as PublishBody;

    const platforms = [...new Set(input.platforms ?? [])].filter(
      (p) => p === 'meta' || p === 'tiktok',
    );
    if (platforms.length === 0) throw new HttpError(400, 'Aucune plateforme sélectionnée');
    if (!isObjective(input.objective)) throw new HttpError(400, 'Objectif inconnu');
    if (!(input.daily_budget_minor > 0)) throw new HttpError(400, 'Budget quotidien invalide');
    if (!input.start_date) throw new HttpError(400, 'Date de début manquante');

    const landingUrl = assertSafeUrl(input.landing_url);
    const admin = adminClient();

    const { data: connections } = await admin
      .from('ad_platform_connections')
      .select('*')
      .eq('business_id', caller.businessId)
      .in('platform', platforms);

    const byPlatform = new Map((connections ?? []).map((c) => [c.platform, c]));

    for (const p of platforms) {
      const c = byPlatform.get(p);
      if (!c) throw new HttpError(400, `Compte ${p === 'meta' ? 'Meta' : 'TikTok'} non connecté`);
      if (c.status !== 'connected') {
        throw new HttpError(400, `Le compte ${p === 'meta' ? 'Meta' : 'TikTok'} doit être reconnecté`);
      }
    }

    // Un budget unique ne peut pas être envoyé à deux comptes qui ne facturent
    // pas dans la même devise : on le dit au lieu de convertir à l'aveugle.
    const currencies = new Set(platforms.map((p) => byPlatform.get(p)!.currency));
    if (currencies.size > 1) {
      throw new HttpError(
        400,
        'Vos comptes publicitaires utilisent des devises différentes : lancez une publicité par plateforme.',
      );
    }

    for (const p of platforms) {
      const c = byPlatform.get(p)!;
      if (c.min_daily_budget_minor && input.daily_budget_minor < c.min_daily_budget_minor) {
        throw new HttpError(
          400,
          `Budget quotidien inférieur au minimum imposé par ${p === 'meta' ? 'Meta' : 'TikTok'}.`,
        );
      }
    }

    const groupId = crypto.randomUUID();
    const start = startInstant(input.start_date);
    const end = input.end_date ? new Date(`${input.end_date}T23:59:00Z`) : null;
    const ageMin = input.age_min ?? 18;
    const ageMax = input.age_max ?? 65;
    const countries = input.countries?.length ? input.countries : ['SN'];

    const results: Array<{ platform: string; ok: boolean; error?: string; campaignId?: string }> = [];

    for (const platform of platforms) {
      const connection = byPlatform.get(platform)!;

      const { data: row, error: insertErr } = await admin
        .from('ad_campaigns')
        .insert({
          business_id:        caller.businessId,
          campaign_group_id:  groupId,
          connection_id:      connection.id,
          platform,
          name:               input.name,
          objective:          input.objective,
          status:             'publishing',
          product_id:         input.product_id ?? null,
          daily_budget_minor: input.daily_budget_minor,
          currency:           connection.currency,
          start_date:         input.start_date,
          end_date:           input.end_date ?? null,
          landing_url:        landingUrl,
          targeting:          { countries, age_min: ageMin, age_max: ageMax },
          creative:           { headline: input.headline, body: input.body, image_url: input.image_url ?? null },
          created_by:         caller.userId,
        })
        .select('id')
        .single();

      if (insertErr || !row) {
        results.push({ platform, ok: false, error: insertErr?.message ?? 'Enregistrement impossible' });
        continue;
      }

      try {
        if (platform === 'meta') {
          if (!connection.page_id) throw new Error('Aucune Page Facebook sélectionnée');

          const spec = metaSpec(input.objective, Boolean(connection.pixel_id));
          const imageHash = input.image_url
            ? await meta.uploadAdImage(connection.access_token, connection.external_account_id, input.image_url)
            : null;

          const ids = await meta.createCampaignStack(connection.access_token, {
            accountId:        connection.external_account_id,
            pageId:           connection.page_id,
            instagramActorId: connection.instagram_actor_id,
            pixelId:          connection.pixel_id,
            name:             input.name,
            objective:        spec.objective,
            optimizationGoal: spec.optimizationGoal,
            billingEvent:     spec.billingEvent,
            callToAction:     spec.callToAction,
            dailyBudget:      toMetaBudget(input.daily_budget_minor),
            startTime:        start.toISOString(),
            endTime:          end?.toISOString() ?? null,
            targeting:        { geo_locations: { countries }, age_min: ageMin, age_max: ageMax },
            headline:         input.headline,
            body:             input.body,
            linkUrl:          landingUrl,
            imageHash,
          });

          // Seulement maintenant : les quatre objets existent, la diffusion peut
          // commencer sans risque d'une campagne à moitié créée.
          await meta.setStackStatus(connection.access_token, ids, 'ACTIVE');

          await admin.from('ad_campaigns').update({
            status:               'active',
            external_campaign_id: ids.campaignId,
            external_adset_id:    ids.adsetId,
            external_ad_id:       ids.adId,
            last_synced_at:       new Date().toISOString(),
          }).eq('id', row.id);

          results.push({ platform, ok: true, campaignId: row.id });
        } else {
          const spec = tiktokSpec(input.objective);

          let identityId = connection.identity_id;
          if (!identityId) {
            identityId = await tiktok.ensureIdentity(
              connection.access_token,
              connection.external_account_id,
              connection.external_account_name ?? input.name,
            );
            await admin.from('ad_platform_connections')
              .update({ identity_id: identityId })
              .eq('id', connection.id);
          }

          const [imageId, locationIds] = await Promise.all([
            input.image_url
              ? tiktok.uploadAdImage(connection.access_token, connection.external_account_id, input.image_url)
              : Promise.resolve(null),
            tiktok.resolveLocationIds(connection.access_token, connection.external_account_id, countries),
          ]);

          if (locationIds.length === 0) {
            throw new Error('Zone de diffusion introuvable chez TikTok pour ce pays');
          }

          const fmt = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');

          const ids = await tiktok.createCampaignStack(connection.access_token, {
            advertiserId:     connection.external_account_id,
            identityId,
            name:             input.name,
            objectiveType:    spec.objectiveType,
            optimizationGoal: spec.optimizationGoal,
            billingEvent:     spec.billingEvent,
            callToAction:     spec.callToAction,
            dailyBudgetMinor: input.daily_budget_minor,
            currency:         connection.currency,
            startTime:        fmt(start),
            endTime:          end ? fmt(end) : null,
            locationIds,
            ageRanges:        tiktokAgeGroups(ageMin, ageMax),
            adText:           input.body,
            landingUrl,
            imageId,
          });

          await tiktok.setStackStatus(
            connection.access_token,
            connection.external_account_id,
            ids,
            'ENABLE',
          );

          await admin.from('ad_campaigns').update({
            status:               'active',
            external_campaign_id: ids.campaignId,
            external_adset_id:    ids.adgroupId,
            external_ad_id:       ids.adId,
            last_synced_at:       new Date().toISOString(),
          }).eq('id', row.id);

          results.push({ platform, ok: true, campaignId: row.id });
        }
      } catch (e) {
        const err = e as Error & { isTokenExpired?: boolean };

        await admin.from('ad_campaigns').update({
          status:        'failed',
          error_message: err.message,
        }).eq('id', row.id);

        if (err.isTokenExpired) {
          await admin.from('ad_platform_connections').update({
            status:     'token_expired',
            last_error: err.message,
          }).eq('id', connection.id);
        }

        results.push({ platform, ok: false, error: err.message });
      }
    }

    return json({ campaign_group_id: groupId, results });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
