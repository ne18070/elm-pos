// Supabase Edge Function — Inviter un utilisateur dans le business
// Déployée via : Supabase Dashboard > Edge Functions > New Function
//
// Variables d'environnement requises (Settings > Edge Functions > Secrets) :
//   SUPABASE_URL          — automatiquement injectée
//   SUPABASE_SERVICE_ROLE_KEY — à ajouter manuellement

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Pre-flight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Vérifier que l'appelant est authentifié
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { email, full_name, role, business_id } = await req.json();

    if (!email || !role || !business_id) {
      return new Response(JSON.stringify({ error: 'Paramètres manquants' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Valider le rôle — on ne peut pas créer un "owner" via invitation
    if (!['admin', 'staff'].includes(role)) {
      return new Response(JSON.stringify({ error: 'Rôle invalide' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Client admin (service role)
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Vérifier que l'appelant est admin/owner du business
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: caller, error: callerErr } = await userClient
      .from('users')
      .select('role, business_id')
      .eq('business_id', business_id)
      .single();

    if (callerErr || !caller || !['admin', 'owner'].includes(caller.role)) {
      return new Response(JSON.stringify({ error: 'Permission refusée' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Envoyer l'invitation par email
    const { data: inviteData, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          full_name: full_name ?? email.split('@')[0],
          role,
          business_id,
        },
        redirectTo: `${Deno.env.get('APP_URL') ?? 'http://localhost:3000'}/login`,
      }
    );

    if (inviteErr) throw inviteErr;

    // Pré-créer le profil si l'utilisateur n'existe pas encore
    if (inviteData?.user) {
      await adminClient.from('users').upsert({
        id: inviteData.user.id,
        email,
        full_name: full_name ?? email.split('@')[0],
        role,
        business_id,
      }, { onConflict: 'id' });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
