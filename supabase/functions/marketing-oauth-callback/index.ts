// Cible du redirect_uri déclaré chez Meta et TikTok.
//
// À déployer SANS vérification de JWT — la plateforme redirige un navigateur
// ici, elle ne porte aucune session Supabase :
//   supabase functions deploy marketing-oauth-callback --no-verify-jwt
//
// La sécurité ne repose donc pas sur un JWT mais sur le `state` à usage unique
// créé par marketing-oauth-start : c'est lui qui rattache le token au bon
// business.

import { adminClient } from '../_shared/auth.ts';
import * as meta from '../_shared/meta.ts';
import * as tiktok from '../_shared/tiktok.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/marketing-oauth-callback`;

function back(origin: string, params: Record<string, string>): Response {
  const url = new URL('/marketing', origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return Response.redirect(url.toString(), 302);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const stateParam = url.searchParams.get('state');
  // Meta renvoie `code`, TikTok `auth_code`.
  const code = url.searchParams.get('code') ?? url.searchParams.get('auth_code');
  const denied = url.searchParams.get('error') ?? url.searchParams.get('error_description');

  if (!stateParam) {
    return new Response('État OAuth manquant', { status: 400 });
  }

  const admin = adminClient();

  const { data: state } = await admin
    .from('ad_oauth_states')
    .select('state, business_id, user_id, platform, return_origin, consumed_at, expires_at')
    .eq('state', stateParam)
    .maybeSingle();

  if (!state) return new Response('État OAuth inconnu', { status: 400 });

  const origin = state.return_origin;

  // Usage unique : un `state` rejoué ne doit jamais réécrire une connexion.
  if (state.consumed_at || new Date(state.expires_at) < new Date()) {
    return back(origin, { error: 'expired' });
  }
  await admin
    .from('ad_oauth_states')
    .update({ consumed_at: new Date().toISOString() })
    .eq('state', stateParam);

  if (denied || !code) {
    return back(origin, { error: 'denied', platform: state.platform });
  }

  try {
    const row: Record<string, unknown> = {
      business_id:  state.business_id,
      platform:     state.platform,
      connected_by: state.user_id,
      last_error:   null,
      last_checked_at: new Date().toISOString(),
    };

    if (state.platform === 'meta') {
      const short = await meta.exchangeCode(code, REDIRECT_URI);
      const { token, expiresIn } = await meta.toLongLivedToken(short);

      const [accounts, pages] = await Promise.all([
        meta.listAdAccounts(token),
        meta.listPages(token),
      ]);

      // Un compte publicitaire utilisable est actif (status 1) ; on ne
      // présélectionne que s'il n'y a aucune ambiguïté.
      const usable = accounts.filter((a) => a.account_status === 1);
      const account = usable.length === 1 ? usable[0] : undefined;
      const page = pages.length === 1 ? pages[0] : undefined;

      row.access_token     = token;
      row.token_expires_at = new Date(Date.now() + expiresIn * 1000).toISOString();
      row.available_accounts = { accounts, pages };

      if (account && page) {
        row.external_account_id     = account.account_id;
        row.external_account_name   = account.name;
        row.currency                = account.currency ?? 'XOF';
        row.min_daily_budget_minor  = account.min_daily_budget ?? null;
        row.page_id                 = page.id;
        row.page_name               = page.name;
        row.instagram_actor_id      = page.instagram_business_account?.id ?? null;
        row.status                  = 'connected';
      } else {
        row.status = 'needs_account_selection';
      }
    } else {
      const token = await tiktok.exchangeCode(code);
      const advertisers = await tiktok.listAdvertisers(token);
      const advertiser = advertisers.length === 1 ? advertisers[0] : undefined;

      row.access_token = token;
      // TikTok ne date pas l'expiration de ce token : on laisse le champ vide
      // et on s'appuie sur les codes d'erreur d'authentification au moment des
      // appels pour détecter une révocation.
      row.token_expires_at   = null;
      row.available_accounts = { advertisers };

      if (advertiser) {
        row.external_account_id   = advertiser.advertiser_id;
        row.external_account_name = advertiser.advertiser_name;
        row.currency              = advertiser.currency ?? 'XOF';
        row.status                = 'connected';
      } else {
        row.status = 'needs_account_selection';
      }
    }

    const { error } = await admin
      .from('ad_platform_connections')
      .upsert(row, { onConflict: 'business_id,platform' });

    if (error) throw new Error(error.message);

    return back(origin, { connected: state.platform, status: String(row.status) });
  } catch (e) {
    await admin
      .from('ad_platform_connections')
      .upsert({
        business_id: state.business_id,
        platform:    state.platform,
        status:      'disconnected',
        last_error:  (e as Error).message,
      }, { onConflict: 'business_id,platform' });

    return back(origin, { error: 'exchange_failed', platform: state.platform });
  }
});
