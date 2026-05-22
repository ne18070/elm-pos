import { NextRequest } from 'next/server';
import { validateApiKey, getApiKey, apiError, handleAuthError, corsHeaders } from '@/lib/api-v1-auth';
import { getSupabaseAdmin as getAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: NextRequest) {
  try {
    const { businessId } = await validateApiKey(getApiKey(request), 'read:restaurant');
    const admin = getAdmin();
    const sp      = request.nextUrl.searchParams;
    const floorId = sp.get('floor_id') ?? '';
    const status  = sp.get('status')   ?? '';

    let query = admin
      .from('restaurant_tables')
      .select('*, floor:restaurant_floors(id, name)')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .order('name');

    if (floorId) query = query.eq('floor_id', floorId);
    if (status)  query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return apiError(error.message, 502);

    return Response.json({ data: data ?? [], total: (data ?? []).length }, { headers: corsHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { businessId } = await validateApiKey(getApiKey(request), 'write:restaurant');
    const admin = getAdmin();

    let body: { table_id?: string; status?: string; current_order_id?: string | null };
    try { body = await request.json(); } catch { return apiError('Invalid JSON body.', 400); }
    if (!body.table_id) return apiError('"table_id" is required.', 400);
    if (!body.status)   return apiError('"status" is required.', 400);

    // Verify table belongs to this business
    const { data: table } = await admin
      .from('restaurant_tables')
      .select('id')
      .eq('id', body.table_id)
      .eq('business_id', businessId)
      .maybeSingle();
    if (!table) return apiError('Table not found.', 404);

    const { data, error } = await admin
      .from('restaurant_tables')
      .update({
        status:            body.status,
        current_order_id:  body.current_order_id ?? null,
        updated_at:        new Date().toISOString(),
      })
      .eq('id', body.table_id)
      .select('*, floor:restaurant_floors(id, name)')
      .single();

    if (error) return apiError(error.message, 502);
    return Response.json({ data }, { headers: corsHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
