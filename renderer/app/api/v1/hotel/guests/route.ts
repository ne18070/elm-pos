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
    const search = sp.get('search') ?? '';

    let query = admin
      .from('hotel_guests')
      .select('*', { count: 'exact' })
      .eq('business_id', businessId)
      .order('full_name')
      .range((page - 1) * limit, page * limit - 1);

    if (search) {
      query = query.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
    }

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
      full_name?: string; phone?: string; email?: string;
      id_type?: string; id_number?: string; nationality?: string;
      address?: string; notes?: string; date_of_birth?: string;
    };
    try { body = await request.json(); } catch { return apiError('Invalid JSON body.', 400); }
    if (!body.full_name?.trim()) return apiError('"full_name" is required.', 400);

    const { data, error } = await admin
      .from('hotel_guests')
      .insert({
        business_id:   businessId,
        full_name:     body.full_name.trim(),
        phone:         body.phone         ?? null,
        email:         body.email         ?? null,
        id_type:       body.id_type       ?? null,
        id_number:     body.id_number     ?? null,
        nationality:   body.nationality   ?? null,
        address:       body.address       ?? null,
        notes:         body.notes         ?? null,
        date_of_birth: body.date_of_birth ?? null,
      })
      .select()
      .single();

    if (error) return apiError(error.message, 502);
    return Response.json({ data }, { status: 201, headers: corsHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
