import { NextRequest } from 'next/server';
import { validateApiKey, getApiKey, apiError, handleAuthError, corsHeaders } from '@/lib/api-v1-auth';
import { getSupabaseAdmin as getAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export function generateStaticParams() { return [{ id: '_' }]; }

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { businessId } = await validateApiKey(getApiKey(request), 'read:resellers');
    const { id } = await params;
    const admin = getAdmin();

    const { data, error } = await admin
      .from('resellers')
      .select('*')
      .eq('id', id)
      .eq('business_id', businessId)
      .maybeSingle();

    if (error) return apiError(error.message, 502);
    if (!data) return apiError('Reseller not found.', 404);

    return Response.json({ data }, { headers: corsHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { businessId } = await validateApiKey(getApiKey(request), 'write:resellers');
    const { id } = await params;
    const admin = getAdmin();

    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { return apiError('Invalid JSON body.', 400); }

    // Verify ownership
    const { data: existing } = await admin
      .from('resellers')
      .select('id')
      .eq('id', id)
      .eq('business_id', businessId)
      .maybeSingle();
    if (!existing) return apiError('Reseller not found.', 404);

    const allowed = ['name','phone','email','address','zone','notes','type','chef_id','is_active'];
    const patch = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));

    const { data, error } = await admin
      .from('resellers')
      .update(patch)
      .eq('id', id)
      .select()
      .single();

    if (error) return apiError(error.message, 502);
    return Response.json({ data }, { headers: corsHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { businessId } = await validateApiKey(getApiKey(request), 'write:resellers');
    const { id } = await params;
    const admin = getAdmin();

    const { data: existing } = await admin
      .from('resellers')
      .select('id')
      .eq('id', id)
      .eq('business_id', businessId)
      .maybeSingle();
    if (!existing) return apiError('Reseller not found.', 404);

    const { error } = await admin.from('resellers').delete().eq('id', id);
    if (error) return apiError(error.message, 502);

    return new Response(null, { status: 204, headers: corsHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
