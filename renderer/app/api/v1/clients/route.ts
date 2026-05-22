import { NextRequest } from 'next/server';
import { validateApiKey, getApiKey, apiError, handleAuthError, corsHeaders } from '@/lib/api-v1-auth';
import { getSupabaseAdmin as getAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: NextRequest) {
  try {
    const { businessId } = await validateApiKey(getApiKey(request), 'read:clients');
    const admin = getAdmin();
    const sp = request.nextUrl.searchParams;
    const page   = Math.max(1, parseInt(sp.get('page')  ?? '1', 10));
    const limit  = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '50', 10)));
    const search = sp.get('search') ?? '';

    let query = admin
      .from('clients')
      .select('*', { count: 'exact' })
      .eq('business_id', businessId)
      .order('name')
      .range((page - 1) * limit, page * limit - 1);

    if (search) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
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
    const { businessId } = await validateApiKey(getApiKey(request), 'write:clients');
    const admin = getAdmin();

    let body: { name?: string; phone?: string; email?: string; address?: string };
    try {
      body = await request.json();
    } catch {
      return apiError('Invalid JSON body.', 400);
    }

    if (!body.name?.trim()) return apiError('"name" is required.', 400);

    const record = {
      business_id: businessId,
      name: body.name.trim(),
      phone: body.phone?.trim() ?? null,
      email: body.email?.trim() ?? null,
      address: body.address?.trim() ?? null,
    };

    const { data, error } = await admin
      .from('clients')
      .upsert(record, { onConflict: 'business_id,phone', ignoreDuplicates: false })
      .select()
      .single();

    if (error) return apiError(error.message, 502);

    return Response.json({ data }, { status: 201, headers: corsHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
