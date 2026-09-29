// Choix du compte publicitaire (et de la Page côté Meta) quand le commerçant
// en possède plusieurs.
//
// Les identifiants reçus sont confrontés à la liste renvoyée par la plateforme
// au moment de la connexion : sans cette vérification, n'importe quel
// identifiant pourrait être rattaché au business et les dépenses partiraient
// d'un compte qui n'appartient pas au commerçant.

import { adminClient, requireCaller, HttpError } from '../_shared/auth.ts';
import { corsHeaders, json, preflight } from '../_shared/cors.ts';
import { listPages } from '../_shared/meta.ts';

interface MetaAccountRow {
  account_id: string;
  name?: string;
  currency?: string;
  min_daily_budget?: number;
}

interface MetaPageRow {
  id: string;
  name?: string;
  instagram_business_account?: { id: string };
}

interface TikTokAdvertiserRow {
  advertiser_id:   string;
  advertiser_name?: string;
  currency?:       string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();

  try {
    const caller = await requireCaller(req);
    const { platform, account_id, page_id } = await req.json() as {
      platform:   'meta' | 'tiktok';
      account_id?: string;
      page_id?:    string;
    };

    if (platform !== 'meta' && platform !== 'tiktok') {
      throw new HttpError(400, 'Plateforme inconnue');
    }
    if (!account_id && !page_id) {
      throw new HttpError(400, 'Rien à sélectionner');
    }

    const admin = adminClient();

    const { data: connection } = await admin
      .from('ad_platform_connections')
      .select('id, available_accounts, access_token, external_account_id')
      .eq('business_id', caller.businessId)
      .eq('platform', platform)
      .maybeSingle();

    if (!connection) throw new HttpError(404, 'Connexion introuvable');

    const available = (connection.available_accounts ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = { last_error: null };

    if (platform === 'meta') {
      const accounts = (available.accounts ?? []) as MetaAccountRow[];
      const knownPages = (available.pages ?? []) as MetaPageRow[];

      // La Page et le compte publicitaire sont deux choix indépendants :
      // publier ne coûte rien et ne demande aucun compte publicitaire, alors
      // que diffuser une annonce l'exige. Les coupler empêcherait un commerçant
      // sans compte publicitaire d'utiliser la publication.
      if (page_id) {
        const page = knownPages.find((p) => p.id === page_id);
        if (!page) throw new HttpError(400, 'Page Facebook non reconnue');

        patch.page_id            = page.id;
        patch.page_name          = page.name ?? null;
        patch.instagram_actor_id = page.instagram_business_account?.id ?? null;

        // Le jeton de Page n'est délibérément pas conservé dans
        // `available_accounts`, qui est lisible par le client : on le redemande
        // à Meta au moment où l'on en a besoin.
        const livePages = await listPages(connection.access_token);
        const pageToken = livePages.find((p) => p.id === page.id)?.access_token ?? null;

        // Meta n'inclut le jeton de Page que si les permissions de publication
        // ont été accordées. Le stocker à null ferait échouer la publication
        // bien plus tard, avec une cause déjà oubliée : on refuse tout de suite.
        if (!pageToken) {
          throw new HttpError(
            400,
            "Facebook n'a pas transmis l'autorisation de publier sur cette Page. Reconnectez votre compte en acceptant l'accès aux publications de Page.",
          );
        }
        patch.page_access_token = pageToken;
      }

      if (account_id) {
        const account = accounts.find((a) => a.account_id === account_id);
        if (!account) throw new HttpError(400, 'Compte publicitaire non reconnu');

        patch.external_account_id    = account.account_id;
        patch.external_account_name  = account.name ?? null;
        patch.currency               = account.currency ?? 'XOF';
        patch.min_daily_budget_minor = account.min_daily_budget ?? null;
      }

      // `connected` décrit la capacité à diffuser : sans compte publicitaire,
      // la connexion reste incomplète de ce point de vue, même si la Page
      // suffit déjà pour publier.
      patch.status = (account_id || connection.external_account_id)
        ? 'connected'
        : 'needs_account_selection';
    } else {
      patch.status = 'connected';
      const advertisers = (available.advertisers ?? []) as TikTokAdvertiserRow[];
      const advertiser = advertisers.find((a) => a.advertiser_id === account_id);
      if (!advertiser) throw new HttpError(400, 'Compte publicitaire non reconnu');

      patch.external_account_id   = advertiser.advertiser_id;
      patch.external_account_name = advertiser.advertiser_name ?? null;
      patch.currency              = advertiser.currency ?? 'XOF';
    }

    const { error } = await admin
      .from('ad_platform_connections')
      .update(patch)
      .eq('id', connection.id);

    if (error) throw new HttpError(500, error.message);

    return json({ ok: true });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
