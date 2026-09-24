// Démarre la connexion d'un compte publicitaire.
//
// Secrets requis : META_APP_ID, TIKTOK_APP_ID, MARKETING_RETURN_ORIGINS
// (liste d'origines autorisées séparées par des virgules).

import { adminClient, requireCaller, HttpError, SUPABASE_URL } from '../_shared/auth.ts';
import { corsHeaders, json, preflight } from '../_shared/cors.ts';
import { metaAuthUrl } from '../_shared/meta.ts';
import { tiktokAuthUrl } from '../_shared/tiktok.ts';

const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/marketing-oauth-callback`;

function allowedOrigins(): string[] {
  return (Deno.env.get('MARKETING_RETURN_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();

  try {
    const caller = await requireCaller(req);
    const { platform, return_origin } = await req.json();

    if (platform !== 'meta' && platform !== 'tiktok') {
      throw new HttpError(400, 'Plateforme inconnue');
    }

    // Le retour se fait vers une origine connue d'avance. Sans cette liste
    // blanche, le paramètre deviendrait une redirection ouverte utilisable pour
    // renvoyer un commerçant authentifié vers un site tiers.
    const origins = allowedOrigins();
    const requested = String(return_origin ?? '').replace(/\/$/, '');
    const origin = origins.includes(requested) ? requested : origins[0];
    if (!origin) throw new HttpError(500, 'MARKETING_RETURN_ORIGINS non configuré');

    const admin = adminClient();
    const { data: state, error } = await admin
      .from('ad_oauth_states')
      .insert({
        business_id:   caller.businessId,
        user_id:       caller.userId,
        platform,
        return_origin: origin,
      })
      .select('state')
      .single();

    if (error || !state) throw new HttpError(500, error?.message ?? 'État OAuth non créé');

    const url = platform === 'meta'
      ? metaAuthUrl(state.state, REDIRECT_URI)
      : tiktokAuthUrl(state.state, REDIRECT_URI);

    return json({ url });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
