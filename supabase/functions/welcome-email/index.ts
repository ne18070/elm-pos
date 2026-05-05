import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
  }

  try {
    const payload = await req.json();
    const { type, table, record, old_record } = payload;

    // On déclenche quand onboarding_done passe à TRUE sur un business
    if (table !== 'businesses' || !record.onboarding_done || (old_record && old_record.onboarding_done)) {
      return new Response(JSON.stringify({ skipped: true, reason: 'Not an onboarding completion event' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    
    // 1. Trouver l'utilisateur Owner de ce business
    const { data: owner, error: ownerError } = await supabase
      .from('users')
      .select('email, full_name')
      .eq('business_id', record.id)
      .eq('role', 'owner')
      .single();

    if (ownerError || !owner?.email) {
      console.error('Owner not found for business:', record.id, ownerError);
      return new Response(JSON.stringify({ error: 'Owner not found' }), { status: 404 });
    }

    // 2. Déterminer le template selon le secteur
    const sector = record.industry_sector || record.type;
    let templateKey = 'welcome';
    
    if (['restaurant', 'juridique', 'location', 'hotel'].includes(sector)) {
      templateKey = `welcome_${sector}`;
    } else if (sector === 'boutique' || sector === 'retail') {
      templateKey = 'welcome_retail';
    }

    // 3. Appel de la fonction send-email
    const response = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        type: templateKey,
        to: owner.email,
        subject: 'Bienvenue sur ELM APP !',
        data: {
          full_name: owner.full_name || owner.email.split('@')[0],
        },
      }),
    });

    const result = await response.json();
    return new Response(JSON.stringify({ 
      success: true, 
      template: templateKey, 
      email: owner.email,
      id: result.id 
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error in welcome-email:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
