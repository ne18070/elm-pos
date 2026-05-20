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
    const { businessId } = await validateApiKey(getApiKey(request), 'read:analytics');
    const admin = getAdmin();
    const sp = request.nextUrl.searchParams;

    const now  = new Date();
    const from = sp.get('from') ?? new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const to   = sp.get('to')   ?? now.toISOString();

    const { data: orders, error } = await admin
      .from('orders')
      .select('total, items:order_items(product_id, name, total)')
      .eq('business_id', businessId)
      .eq('status', 'paid')
      .gte('created_at', from)
      .lte('created_at', to);

    if (error) return apiError(error.message, 502);

    const ordersArr = orders ?? [];
    const revenue      = ordersArr.reduce((s: number, o: { total: number }) => s + (o.total ?? 0), 0);
    const ordersCount  = ordersArr.length;
    const avgBasket    = ordersCount > 0 ? revenue / ordersCount : 0;

    // Aggregate items into top products
    const productTotals = new Map<string, { name: string; revenue: number; count: number }>();
    for (const order of ordersArr as Array<{ items: Array<{ product_id: string; name: string; total: number }> }>) {
      for (const item of order.items ?? []) {
        const existing = productTotals.get(item.product_id);
        if (existing) {
          existing.revenue += item.total ?? 0;
          existing.count++;
        } else {
          productTotals.set(item.product_id, {
            name: item.name,
            revenue: item.total ?? 0,
            count: 1,
          });
        }
      }
    }

    const topProducts = [...productTotals.entries()]
      .map(([product_id, v]) => ({ product_id, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    return Response.json(
      { data: { revenue, orders_count: ordersCount, avg_basket: Math.round(avgBasket), top_products: topProducts, from, to } },
      { headers: corsHeaders() },
    );
  } catch (err) {
    return handleAuthError(err);
  }
}
