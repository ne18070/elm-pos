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
    const { businessId } = await validateApiKey(getApiKey(request), 'read:products');
    const { id } = await params;
    const admin = getAdmin();

    const { data, error } = await admin
      .from('products')
      .select('*, category:categories(id, name)')
      .eq('id', id)
      .eq('business_id', businessId)
      .maybeSingle();

    if (error) return apiError(error.message, 502);
    if (!data) return apiError('Product not found.', 404);

    return Response.json({ data }, { headers: corsHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
