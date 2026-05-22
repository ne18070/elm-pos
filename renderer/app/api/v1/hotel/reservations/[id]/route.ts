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
    const { businessId } = await validateApiKey(getApiKey(request), 'read:hotel');
    const { id } = await params;
    const admin = getAdmin();

    const { data, error } = await admin
      .from('hotel_reservations')
      .select('*, room:hotel_rooms(*), guest:hotel_guests(*)')
      .eq('id', id)
      .eq('business_id', businessId)
      .maybeSingle();

    if (error) return apiError(error.message, 502);
    if (!data) return apiError('Reservation not found.', 404);

    return Response.json({ data }, { headers: corsHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { businessId } = await validateApiKey(getApiKey(request), 'write:hotel');
    const { id } = await params;
    const admin = getAdmin();

    const { data: existing } = await admin
      .from('hotel_reservations')
      .select('id')
      .eq('id', id)
      .eq('business_id', businessId)
      .maybeSingle();
    if (!existing) return apiError('Reservation not found.', 404);

    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { return apiError('Invalid JSON body.', 400); }

    const allowed = ['status', 'notes', 'paid_amount', 'actual_check_in', 'actual_check_out', 'num_guests'];
    const patch = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));

    const { data, error } = await admin
      .from('hotel_reservations')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*, room:hotel_rooms(id,number,type), guest:hotel_guests(id,full_name,phone)')
      .single();

    if (error) return apiError(error.message, 502);
    return Response.json({ data }, { headers: corsHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
