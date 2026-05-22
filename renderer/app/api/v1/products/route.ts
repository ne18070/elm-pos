import { NextRequest } from 'next/server';
import { validateApiKey, getApiKey, apiOk, apiError, handleAuthError, corsHeaders } from '@/lib/api-v1-auth';
import { getSupabaseAdmin as getAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: NextRequest) {
  try {
    const { businessId } = await validateApiKey(getApiKey(request), 'read:products');
    const admin = getAdmin();
    const sp = request.nextUrl.searchParams;
    const page  = Math.max(1, parseInt(sp.get('page')  ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '50', 10)));
    const search      = sp.get('search')      ?? '';
    const categoryId  = sp.get('category_id') ?? '';
    const inStockOnly = sp.get('in_stock')    === 'true';

    let query = admin
      .from('products')
      .select('*, category:categories(id, name)', { count: 'exact' })
      .eq('business_id', businessId)
      .eq('is_active', true)
      .order('name')
      .range((page - 1) * limit, page * limit - 1);

    if (search)      query = query.ilike('name', `%${search}%`);
    if (categoryId)  query = query.eq('category_id', categoryId);
    if (inStockOnly) query = query.gt('stock', 0);

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
