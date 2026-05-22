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
    const from   = sp.get('from')   ?? '';
    const to     = sp.get('to')     ?? '';
    const roomId = sp.get('room_id') ?? '';

    let query = admin
      .from('hotel_reservations')
      .select('*, room:hotel_rooms(id,number,type), guest:hotel_guests(id,full_name,phone)', { count: 'exact' })
      .eq('business_id', businessId)
      .order('check_in', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (status) query = query.eq('status', status);
    if (roomId) query = query.eq('room_id', roomId);
    if (from)   query = query.gte('check_in', from);
    if (to)     query = query.lte('check_out', to);

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
      room_id?: string; guest_id?: string;
      check_in?: string; check_out?: string;
      num_guests?: number; price_per_night?: number;
      notes?: string; source?: string;
    };
    try { body = await request.json(); } catch { return apiError('Invalid JSON body.', 400); }

    if (!body.room_id)    return apiError('"room_id" is required.', 400);
    if (!body.guest_id)   return apiError('"guest_id" is required.', 400);
    if (!body.check_in)   return apiError('"check_in" is required (ISO date).', 400);
    if (!body.check_out)  return apiError('"check_out" is required (ISO date).', 400);

    // Fetch room to get price and verify it belongs to this business
    const { data: room } = await admin
      .from('hotel_rooms')
      .select('id, price_per_night, status, business_id')
      .eq('id', body.room_id)
      .eq('business_id', businessId)
      .maybeSingle();
    if (!room) return apiError('Room not found.', 404);
    if (room.status !== 'available') return apiError(`Room is currently "${room.status}".`, 409);

    const nights = Math.max(1, Math.round(
      (new Date(body.check_out).getTime() - new Date(body.check_in).getTime()) / 86_400_000,
    ));
    const pricePerNight = body.price_per_night ?? room.price_per_night;
    const totalRoom = pricePerNight * nights;

    const { data, error } = await admin
      .from('hotel_reservations')
      .insert({
        business_id:     businessId,
        room_id:         body.room_id,
        guest_id:        body.guest_id,
        check_in:        body.check_in,
        check_out:       body.check_out,
        num_guests:      body.num_guests      ?? 1,
        price_per_night: pricePerNight,
        total_room:      totalRoom,
        total_services:  0,
        total:           totalRoom,
        paid_amount:     0,
        status:          'confirmed',
        notes:           body.notes           ?? null,
        source:          body.source          ?? 'api',
      })
      .select('*, room:hotel_rooms(id,number,type), guest:hotel_guests(id,full_name,phone)')
      .single();

    if (error) return apiError(error.message, 502);
    return Response.json({ data }, { status: 201, headers: corsHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
