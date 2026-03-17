import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response('Non autorisé', { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  );

  if (authError || !user) {
    return new Response('Non autorisé', { status: 401 });
  }

  const { coupon_code, business_id, order_total, user_id } = await req.json() as {
    coupon_code: string;
    business_id: string;
    order_total: number;
    user_id: string;
  };

  // Rechercher le coupon
  const { data: coupon, error } = await supabase
    .from('coupons')
    .select('*')
    .eq('business_id', business_id)
    .eq('code', coupon_code.toUpperCase().trim())
    .single();

  if (error || !coupon) {
    return new Response(
      JSON.stringify({ valid: false, error: 'Coupon introuvable' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Vérifications
  if (!coupon.is_active) {
    return new Response(
      JSON.stringify({ valid: false, error: 'Ce coupon est désactivé' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return new Response(
      JSON.stringify({ valid: false, error: 'Ce coupon a expiré' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (coupon.max_uses && coupon.uses_count >= coupon.max_uses) {
    return new Response(
      JSON.stringify({ valid: false, error: 'Ce coupon a atteint sa limite d\'utilisation' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (coupon.min_order_amount && order_total < coupon.min_order_amount) {
    return new Response(
      JSON.stringify({
        valid: false,
        error: `Commande minimum requise : ${coupon.min_order_amount}`,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Vérifier la limite par utilisateur
  if (coupon.per_user_limit) {
    const { count } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('cashier_id', user_id)
      .eq('coupon_id', coupon.id)
      .eq('status', 'paid');

    if ((count ?? 0) >= coupon.per_user_limit) {
      return new Response(
        JSON.stringify({ valid: false, error: 'Vous avez déjà utilisé ce coupon' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  return new Response(
    JSON.stringify({ valid: true, coupon }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
});
