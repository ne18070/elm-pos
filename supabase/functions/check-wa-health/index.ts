import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  // Optionnel: Check auth si appelé depuis le front
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // 1. Récupérer les configs à tester
    const { data: configs, error: fetchErr } = await supabase
      .from('whatsapp_configs')
      .select('id, phone_number_id, access_token, business_id');

    if (fetchErr) throw fetchErr;

    const results = [];

    for (const config of (configs || [])) {
      let health = 'unknown';
      let errorMsg = null;

      try {
        // 2. Appel à Meta API pour vérifier le statut du numéro
        const metaRes = await fetch(
          `https://graph.facebook.com/v19.0/${config.phone_number_id}?fields=status,name_status`,
          {
            headers: { 'Authorization': `Bearer ${config.access_token}` }
          }
        );

        if (metaRes.ok) {
          health = 'healthy';
        } else {
          const errData = await metaRes.json();
          const code = errData.error?.code;
          // Code 190 = Access Token Expired
          health = (code === 190) ? 'token_expired' : 'api_error';
          errorMsg = errData.error?.message || `Status ${metaRes.status}`;
        }
      } catch (e) {
        health = 'api_error';
        errorMsg = e.message;
      }

      // 3. Mettre à jour la base
      await supabase
        .from('whatsapp_configs')
        .update({
          status_health: health,
          last_health_check_at: new Date().toISOString(),
          last_api_error_message: errorMsg
        })
        .eq('id', config.id);

      results.push({ business_id: config.business_id, health });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
