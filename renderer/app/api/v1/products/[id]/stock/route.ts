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

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { businessId } = await validateApiKey(getApiKey(request), 'write:products');
    const { id } = await params;
    const admin = getAdmin();

    let body: { stock?: number; delta?: number };
    try {
      body = await request.json();
    } catch {
      return apiError('Invalid JSON body.', 400);
    }

    if (body.stock === undefined && body.delta === undefined) {
      return apiError('Provide either "stock" (absolute) or "delta" (relative).', 400);
    }

    // Verify product belongs to this business
    const { data: product, error: fetchErr } = await admin
      .from('products')
      .select('id, stock')
      .eq('id', id)
      .eq('business_id', businessId)
      .maybeSingle();

    if (fetchErr) return apiError(fetchErr.message, 502);
    if (!product) return apiError('Product not found.', 404);

    const newStock = body.stock !== undefined
      ? body.stock
      : (product.stock ?? 0) + (body.delta ?? 0);

    if (newStock < 0) return apiError('Stock cannot be negative.', 422);

    const { data, error } = await admin
      .from('products')
      .update({ stock: newStock })
      .eq('id', id)
      .select('id, name, stock')
      .single();

    if (error) return apiError(error.message, 502);

    return Response.json({ data }, { headers: corsHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
