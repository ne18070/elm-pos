import { NextRequest } from 'next/server';
import { validateApiKey, getApiKey, apiError, handleAuthError, corsHeaders } from '@/lib/api-v1-auth';
import { getSupabaseAdmin as getAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: NextRequest) {
  try {
    const { businessId } = await validateApiKey(getApiKey(request), 'read:hotel');
    const admin = getAdmin();
    const sp = request.nextUrl.searchParams;
    const page   = Math.max(1, parseInt(sp.get('page')  ?? '1', 10));
    const limit  = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '50', 10)));
    const status = sp.get('status') ?? '';
    const type   = sp.get('type')   ?? '';

    let query = admin
      .from('hotel_rooms')
      .select('*', { count: 'exact' })
      .eq('business_id', businessId)
      .eq('is_active', true)
      .order('number')
      .range((page - 1) * limit, page * limit - 1);

    if (status) query = query.eq('status', status);
    if (type)   query = query.eq('type', type);

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

export async function POST(request: NextRequest) {
  try {
    const { businessId } = await validateApiKey(getApiKey(request), 'write:hotel');
    const admin = getAdmin();

    let body: {
      number?: string; type?: string; floor?: string;
      capacity?: number; price_per_night?: number;
      weekend_price_per_night?: number; description?: string; amenities?: string[];
    };
    try { body = await request.json(); } catch { return apiError('Invalid JSON body.', 400); }

    if (!body.number?.trim())         return apiError('"number" is required.', 400);
    if (!body.price_per_night)        return apiError('"price_per_night" is required.', 400);

    const { data, error } = await admin
      .from('hotel_rooms')
      .insert({
        business_id:              businessId,
        number:                   body.number.trim(),
        type:                     body.type                     ?? 'simple',
        floor:                    body.floor                    ?? null,
        capacity:                 body.capacity                 ?? 1,
        price_per_night:          body.price_per_night,
        weekend_price_per_night:  body.weekend_price_per_night  ?? null,
        description:              body.description              ?? null,
        amenities:                body.amenities                ?? [],
        status:                   'available',
        is_active:                true,
      })
      .select()
      .single();

    if (error) return apiError(error.message, 502);
    return Response.json({ data }, { status: 201, headers: corsHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
