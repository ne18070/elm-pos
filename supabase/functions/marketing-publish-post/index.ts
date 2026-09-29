// Publie une photo légendée sur la Page Facebook et/ou le compte Instagram du
// commerçant.
//
// Rien à voir avec la publicité : aucune dépense, aucun compte publicitaire
// requis. Seule la connexion Meta est nécessaire, ce qui rend la fonction
// utilisable par des commerçants qui ne feront jamais de campagne payante.

import { adminClient, requireCaller, HttpError } from '../_shared/auth.ts';
import { corsHeaders, json, preflight } from '../_shared/cors.ts';
import * as meta from '../_shared/meta.ts';

type Target = 'facebook' | 'instagram';

interface PublishBody {
  targets:    Target[];
  message:    string;
  image_url?: string | null;
  product_id?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();

  try {
    const caller = await requireCaller(req);
    const input = await req.json() as PublishBody;

    const targets = [...new Set(input.targets ?? [])].filter(
      (t) => t === 'facebook' || t === 'instagram',
    );
    if (targets.length === 0) throw new HttpError(400, 'Aucune destination sélectionnée');

    const message = (input.message ?? '').trim();
    if (!message) throw new HttpError(400, 'Le texte de la publication est vide');

    const imageUrl = input.image_url?.trim() || null;
    if (targets.includes('instagram') && !imageUrl) {
      throw new HttpError(400, 'Instagram exige une photo : une publication en texte seul est impossible.');
    }

    const admin = adminClient();
    const { data: connection } = await admin
      .from('ad_platform_connections')
      .select('page_id, page_access_token, instagram_actor_id, status')
      .eq('business_id', caller.businessId)
      .eq('platform', 'meta')
      .maybeSingle();

    // On ne teste surtout pas `status === 'connected'` : ce statut décrit la
    // capacité à diffuser des annonces, pas à publier. L'exiger ici fermerait
    // la publication aux commerçants sans compte publicitaire, qui sont
    // justement ceux pour qui elle a été faite.
    if (!connection || connection.status === 'disconnected') {
      throw new HttpError(400, 'Connectez votre compte Facebook avant de publier.');
    }
    if (!connection.page_id || !connection.page_access_token) {
      throw new HttpError(
        400,
        "Aucune Page Facebook n'est reliée, ou l'autorisation de publier n'a pas été accordée. Reconnectez votre compte.",
      );
    }
    if (targets.includes('instagram') && !connection.instagram_actor_id) {
      throw new HttpError(
        400,
        "Aucun compte Instagram professionnel n'est rattaché à votre Page Facebook.",
      );
    }

    const results: Array<{ target: Target; ok: boolean; error?: string }> = [];

    for (const target of targets) {
      try {
        const postId = target === 'facebook'
          ? imageUrl
            ? await meta.publishPagePhoto(connection.page_access_token, connection.page_id, message, imageUrl)
            : await meta.publishPageText(connection.page_access_token, connection.page_id, message)
          : await meta.publishInstagramPhoto(
              connection.page_access_token, connection.instagram_actor_id!, message, imageUrl!,
            );

        await admin.from('social_posts').insert({
          business_id:      caller.businessId,
          platform:         target,
          status:           'published',
          message,
          image_url:        imageUrl,
          product_id:       input.product_id ?? null,
          external_post_id: postId,
          created_by:       caller.userId,
        });

        results.push({ target, ok: true });
      } catch (e) {
        const err = e as Error;

        await admin.from('social_posts').insert({
          business_id:   caller.businessId,
          platform:      target,
          status:        'failed',
          message,
          image_url:     imageUrl,
          product_id:    input.product_id ?? null,
          error_message: err.message,
          created_by:    caller.userId,
        });

        results.push({ target, ok: false, error: err.message });
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
