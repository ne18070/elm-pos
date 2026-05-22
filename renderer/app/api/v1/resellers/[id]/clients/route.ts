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

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { businessId } = await validateApiKey(getApiKey(request), 'read:resellers');
    const { id: resellerId } = await params;
    const admin = getAdmin();

    // Verify reseller belongs to this business
    const { data: reseller } = await admin
      .from('resellers')
      .select('id')
      .eq('id', resellerId)
      .eq('business_id', businessId)
      .maybeSingle();
    if (!reseller) return apiError('Reseller not found.', 404);

    const sp = request.nextUrl.searchParams;
    const page  = Math.max(1, parseInt(sp.get('page')  ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '50', 10)));

    const { data, error, count } = await admin
      .from('reseller_clients')
      .select('*', { count: 'exact' })
      .eq('reseller_id', resellerId)
      .eq('business_id', businessId)
      .order('name')
      .range((page - 1) * limit, page * limit - 1);

    if (error) return apiError(error.message, 502);

    return Response.json(
      { data: data ?? [], total: count ?? 0, page, limit },
      { headers: corsHeaders() },
    );
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { businessId } = await validateApiKey(getApiKey(request), 'write:resellers');
    const { id: resellerId } = await params;
    const admin = getAdmin();

    const { data: reseller } = await admin
      .from('resellers')
      .select('id')
      .eq('id', resellerId)
      .eq('business_id', businessId)
      .maybeSingle();
    if (!reseller) return apiError('Reseller not found.', 404);

    let body: { name?: string; phone?: string; address?: string };
    try { body = await request.json(); } catch { return apiError('Invalid JSON body.', 400); }
    if (!body.name?.trim()) return apiError('"name" is required.', 400);

    const { data, error } = await admin
      .from('reseller_clients')
      .insert({
        reseller_id: resellerId,
        business_id: businessId,
        name:        body.name.trim(),
        phone:       body.phone   ?? null,
        address:     body.address ?? null,
      })
      .select()
      .single();

    if (error) return apiError(error.message, 502);
    return Response.json({ data }, { status: 201, headers: corsHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
