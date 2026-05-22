import { NextRequest } from 'next/server';
import { validateApiKey, getApiKey, apiError, handleAuthError, corsHeaders } from '@/lib/api-v1-auth';
import { getSupabaseAdmin as getAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export function generateStaticParams() { return [{ id: '_' }]; }

const VALID_STATUSES = ['attente', 'en_cours', 'pause', 'termine', 'paye', 'annule'];

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { businessId } = await validateApiKey(getApiKey(request), 'read:services');
    const { id } = await params;
    const admin = getAdmin();

    const { data, error } = await admin
      .from('service_orders')
      .select('*, items:service_order_items(*), payments:service_order_payments(*)')
      .eq('id', id)
      .eq('business_id', businessId)
      .maybeSingle();

    if (error) return apiError(error.message, 502);
    if (!data) return apiError('Service order not found.', 404);

    return Response.json({ data }, { headers: corsHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { businessId } = await validateApiKey(getApiKey(request), 'write:services');
    const { id } = await params;
    const admin = getAdmin();

    const { data: existing } = await admin
      .from('service_orders')
      .select('id, status')
      .eq('id', id)
      .eq('business_id', businessId)
      .maybeSingle();
    if (!existing) return apiError('Service order not found.', 404);

    let body: {
      status?:         string;
      assigned_to?:    string | null;
      notes?:          string | null;
      client_name?:    string | null;
      client_phone?:   string | null;
    };
    try { body = await request.json(); } catch { return apiError('Invalid JSON body.', 400); }

    if (body.status && !VALID_STATUSES.includes(body.status)) {
      return apiError(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}.`, 422);
    }

    const patch: Record<string, unknown> = {};
    const allowed = ['status', 'assigned_to', 'notes', 'client_name', 'client_phone'];
    for (const key of allowed) {
      if (key in body) patch[key] = (body as Record<string, unknown>)[key];
    }

    // Auto-set timestamps based on status transitions
    if (body.status === 'en_cours' && existing.status === 'attente') {
      patch.started_at = new Date().toISOString();
    }
    if (body.status === 'termine' || body.status === 'paye') {
      patch.finished_at = new Date().toISOString();
    }
    if (body.status === 'paye') {
      patch.paid_at = new Date().toISOString();
    }

    const { data, error } = await admin
      .from('service_orders')
      .update(patch)
      .eq('id', id)
      .select('*, items:service_order_items(*), payments:service_order_payments(*)')
      .single();

    if (error) return apiError(error.message, 502);
    return Response.json({ data }, { headers: corsHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
