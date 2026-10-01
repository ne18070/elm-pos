import { NextRequest } from 'next/server';
import { validateApiKey, getApiKey, apiError, handleAuthError, corsHeaders } from '@/lib/api-v1-auth';
import { getSupabaseAdmin as getAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export function generateStaticParams() { return [{ id: '_' }]; }

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

    // Optimistic concurrency: adjust_stock refuses the write if the stock moved
    // between our read and our write (e.g. a POS sale). We then re-read and
    // retry, so a "delta" is never applied to a stale value and a concurrent
    // sale is never overwritten.
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: product, error: fetchErr } = await admin
        .from('products')
        .select('id, name, stock, track_stock')
        .eq('id', id)
        .eq('business_id', businessId)
        .maybeSingle();

      if (fetchErr) return apiError(fetchErr.message, 502);
      if (!product) return apiError('Product not found.', 404);

      const current  = Number(product.stock ?? 0);
      const newStock = body.stock !== undefined ? body.stock : current + (body.delta ?? 0);

      if (newStock < 0) return apiError('Stock cannot be negative.', 422);

      if (!product.track_stock) {
        // Stock not tracked: no ledger / accounting, plain update as before.
        const { data, error } = await admin
          .from('products')
          .update({ stock: newStock })
          .eq('id', id)
          .select('id, name, stock')
          .single();
        if (error) return apiError(error.message, 502);
        return Response.json({ data }, { headers: corsHeaders() });
      }

      const { error } = await admin.rpc('adjust_stock', {
        p_product_id: id,
        p_expected:   current,
        p_new_qty:    newStock,
        p_reason:     'API v1',
      });
      if (error) {
        if (error.message.includes('STOCK_A_CHANGE')) continue;
        return apiError(error.message, 502);
      }

      const data = { id: product.id, name: product.name, stock: newStock };
      return Response.json({ data }, { headers: corsHeaders() });
    }

    return apiError('Stock changed concurrently, please retry.', 409);
  } catch (err) {
    return handleAuthError(err);
  }
}
