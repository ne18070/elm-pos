import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface OrderItem {
  product_id: string;
  variant_id?: string;
  name: string;
  price: number;
  quantity: number;
  discount_amount: number;
  total: number;
  notes?: string;
}

interface Payment {
  method: string;
  amount: number;
  reference?: string;
}

interface OrderData {
  business_id: string;
  cashier_id: string;
  items: OrderItem[];
  payment: Payment;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  coupon_id?: string;
  coupon_code?: string;
  notes?: string;
}

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

  // Vérifier l'utilisateur
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));

  if (authError || !user) {
    return new Response('Non autorisé', { status: 401 });
  }

  const { order_data }: { order_data: OrderData } = await req.json();

  // Transaction : créer commande + articles + paiement
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      business_id:     order_data.business_id,
      cashier_id:      order_data.cashier_id,
      status:          'paid',
      subtotal:        order_data.subtotal,
      tax_amount:      order_data.tax_amount,
      discount_amount: order_data.discount_amount,
      total:           order_data.total,
      coupon_id:       order_data.coupon_id,
      coupon_code:     order_data.coupon_code,
      notes:           order_data.notes,
    })
    .select()
    .single();

  if (orderError || !order) {
    return new Response(JSON.stringify({ error: orderError?.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Insérer les articles
  const items = order_data.items.map((item) => ({
    ...item,
    order_id: order.id,
  }));

  const { error: itemsError } = await supabase.from('order_items').insert(items);
  if (itemsError) {
    // Rollback : annuler la commande
    await supabase.from('orders').delete().eq('id', order.id);
    return new Response(JSON.stringify({ error: itemsError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Enregistrer le paiement
  const { error: paymentError } = await supabase.from('payments').insert({
    order_id:  order.id,
    method:    order_data.payment.method,
    amount:    order_data.payment.amount,
    reference: order_data.payment.reference,
  });

  if (paymentError) {
    return new Response(JSON.stringify({ error: paymentError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Décrémenter le stock pour les produits suivis
  for (const item of order_data.items) {
    await supabase.rpc('decrement_stock', {
      p_product_id: item.product_id,
      p_quantity:   item.quantity,
    });
  }

  // Incrémenter uses_count du coupon si présent
  if (order_data.coupon_id) {
    await supabase.rpc('increment_coupon_uses', {
      p_coupon_id: order_data.coupon_id,
    });
  }

  // Retourner la commande complète
  const { data: fullOrder } = await supabase
    .from('orders')
    .select('*, items:order_items(*), payments(*)')
    .eq('id', order.id)
    .single();

  return new Response(JSON.stringify(fullOrder), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
