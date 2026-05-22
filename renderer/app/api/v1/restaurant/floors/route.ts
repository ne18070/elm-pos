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

    const { data, error } = await admin
      .from('restaurant_floors')
      .select('*, tables:restaurant_tables(id, name, capacity, status, seats)')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .order('position');

    if (error) return apiError(error.message, 502);
    return Response.json({ data: data ?? [], total: (data ?? []).length }, { headers: corsHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
