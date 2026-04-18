import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface IntouchRequest {
  business_id:        string;
  amount:             number;
  currency:           string;
  phone:              string;
  provider:           'WAVE' | 'ORANGE_MONEY' | 'FREE_MONEY';
  external_reference: string;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Non autorisé');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. Verify user (Security)
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) throw new Error('Session invalide');

    const body: IntouchRequest = await req.json();
    const { business_id, amount, phone, provider, external_reference } = body;

    // 2. Fetch PRIVATE Intouch Config (api_key included here because we use service_role)
    const { data: config, error: configError } = await supabase
      .from('intouch_configs')
      .select('*')
      .eq('business_id', business_id)
      .single();

    if (configError || !config) throw new Error('Intouch n\'est pas configuré pour ce business');
    if (!config.is_active) throw new Error('Intouch est désactivé pour ce business');

    // 3. Prepare Intouch API Call
    // Note: Adjust the endpoint and auth based on Intouch/TouchPay specific documentation.
    const INTOUCH_API_URL = 'https://api.touchpay.sn/v1/cashin'; // Mock URL, adjust to real one
    
    // Auth logic: often Basic Auth with partner_id:api_key
    const auth = btoa(`${config.partner_id}:${config.api_key}`);

    const payload = {
      partner_id:             config.partner_id,
      partner_transaction_id: external_reference,
      amount:                 amount,
      currency:               'XOF',
      recipient_phone:        phone,
      service_id:             provider, // 'WAVE', 'ORANGE_MONEY', etc.
      callback_url:           `${Deno.env.get('SUPABASE_URL')}/functions/v1/intouch-callback`,
    };

    console.log(`[Intouch] Initiating payment ${external_reference} for ${amount} XOF via ${provider}`);

    // 4. ACTUAL CALL (Simulated for this script, but structure is ready)
    /*
    const response = await fetch(INTOUCH_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    */

    // --- MOCK RESPONSE FOR DEMO ---
    const result = { status: 'PENDING', transaction_id: `INT-${Math.random().toString(36).toUpperCase().slice(2, 10)}` };
    // --- END MOCK ---

    // 5. Update Local Transaction Status
    await supabase.rpc('update_payment_transaction_status', {
      p_external_ref: external_reference,
      p_status:       result.status,
      p_transaction_id: result.transaction_id,
      p_response:     result
    });

    return new Response(JSON.stringify({ 
      status:         result.status, 
      transaction_id: result.transaction_id 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('[Intouch Error]', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
