import { NextRequest } from 'next/server';
import { validateApiKey, getApiKey, apiError, handleAuthError, corsHeaders } from '@/lib/api-v1-auth';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  return createClient(url, key);
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: NextRequest) {
  try {
    const { businessId } = await validateApiKey(getApiKey(request), 'read:orders');
    const admin = getAdmin();
    const sp = request.nextUrl.searchParams;
    const page   = Math.max(1, parseInt(sp.get('page')  ?? '1', 10));
    const limit  = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '50', 10)));
    const status = sp.get('status') ?? '';
    const from   = sp.get('from')   ?? '';
    const to     = sp.get('to')     ?? '';

    let query = admin
      .from('orders')
      .select('*, items:order_items(*), payments(*)', { count: 'exact' })
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (status && status !== 'all') query = query.eq('status', status);
    if (from) query = query.gte('created_at', from);
    if (to)   query = query.lte('created_at', to);

    const { data, error, count } = await query;
    if (error) return apiError(error.message, 502);

    return Response.json(
      { data: data ?? [], total: count ?? 0, page, limit },
      { headers: corsHeaders() },
    );
  } catch (err) {
    return handleAuthError(err);
  }
}

type OrderItem = { product_id: string; quantity: number; price?: number; name?: string };

export async function POST(request: NextRequest) {
  try {
    const { businessId } = await validateApiKey(getApiKey(request), 'write:orders');
    const admin = getAdmin();

    let body: {
      customer_name?: string;
      customer_phone?: string;
      items?: OrderItem[];
      payment_method?: string;
      notes?: string;
      source?: string;
    };
    try {
      body = await request.json();
    } catch {
      return apiError('Invalid JSON body.', 400);
    }

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return apiError('items array is required and must not be empty.', 400);
    }

    // Resolve product prices for items that omit price
    const productIds = body.items.map((i) => i.product_id).filter(Boolean);
    const { data: products } = await admin
      .from('products')
      .select('id, name, price')
      .in('id', productIds)
      .eq('business_id', businessId);

    const productMap = new Map((products ?? []).map((p: { id: string; name: string; price: number }) => [p.id, p]));

    const resolvedItems = body.items.map((item) => {
      const prod = productMap.get(item.product_id) as { id: string; name: string; price: number } | undefined;
      const price = item.price ?? prod?.price ?? 0;
      const name  = item.name  ?? prod?.name  ?? item.product_id;
      return {
        product_id: item.product_id,
        variant_id: null,
        name,
        price,
        quantity: Math.max(1, item.quantity ?? 1),
        discount_amount: 0,
        total: price * Math.max(1, item.quantity ?? 1),
        notes: null,
        stock_consumption: 1,
      };
    });

    const subtotal = resolvedItems.reduce((s, i) => s + i.total, 0);

    const { data: order, error } = await admin.rpc('create_order', {
      order_data: {
        business_id: businessId,
        cashier_id: null,
        items: resolvedItems,
        payment: { method: body.payment_method ?? 'cash', amount: subtotal },
        subtotal,
        tax_amount: 0,
        discount_amount: 0,
        total: subtotal,
        coupon_id: null,
        coupon_code: null,
        coupon_notes: null,
        coupon_ids: [],
        coupon_codes: [],
        notes: body.notes ?? `Source: ${body.source ?? 'api'}`,
        customer_name: body.customer_name ?? null,
        customer_phone: body.customer_phone ?? null,
        table_id: null,
        order_channel: 'emporter',
        delivery_address: null,
      },
    });

    if (error) return apiError(error.message, 502);

    return Response.json({ data: order }, { status: 201, headers: corsHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
