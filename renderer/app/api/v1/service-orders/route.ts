import { NextRequest } from 'next/server';
import { validateApiKey, getApiKey, apiError, handleAuthError, corsHeaders } from '@/lib/api-v1-auth';
import { getSupabaseAdmin as getAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: NextRequest) {
  try {
    const { businessId } = await validateApiKey(getApiKey(request), 'read:services');
    const admin = getAdmin();
    const sp = request.nextUrl.searchParams;
    const page       = Math.max(1, parseInt(sp.get('page')   ?? '1',  10));
    const limit      = Math.min(100, Math.max(1, parseInt(sp.get('limit')  ?? '50', 10)));
    const status     = sp.get('status')      ?? '';
    const assignedTo = sp.get('assigned_to') ?? '';
    const from       = sp.get('from')        ?? '';
    const to         = sp.get('to')          ?? '';
    const search     = sp.get('search')      ?? '';

    let query = admin
      .from('service_orders')
      .select('*, items:service_order_items(*), payments:service_order_payments(*)', { count: 'exact' })
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (status)     query = query.eq('status', status);
    if (assignedTo) query = query.eq('assigned_to', assignedTo);
    if (from)       query = query.gte('created_at', from);
    if (to)         query = query.lte('created_at', to);
    if (search)     query = query.or(
      `client_name.ilike.%${search}%,client_phone.ilike.%${search}%,subject_ref.ilike.%${search}%`,
    );

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
    const { businessId } = await validateApiKey(getApiKey(request), 'write:services');
    const admin = getAdmin();

    let body: {
      client_name?:   string;
      client_phone?:  string;
      subject_ref?:   string;
      subject_type?:  string;
      subject_info?:  string;
      assigned_to?:   string;
      notes?:         string;
      items?:         Array<{ name: string; price: number; quantity?: number; service_id?: string }>;
    };
    try { body = await request.json(); } catch { return apiError('Invalid JSON body.', 400); }

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return apiError('"items" array is required and must not be empty.', 400);
    }

    const resolvedItems = body.items.map((item) => ({
      name:       item.name,
      price:      item.price ?? 0,
      quantity:   Math.max(1, item.quantity ?? 1),
      total:      (item.price ?? 0) * Math.max(1, item.quantity ?? 1),
      service_id: item.service_id ?? null,
    }));
    const total = resolvedItems.reduce((s, i) => s + i.total, 0);

    // Get next order number for this business
    const { data: lastOrder } = await admin
      .from('service_orders')
      .select('order_number')
      .eq('business_id', businessId)
      .order('order_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    const orderNumber = (lastOrder?.order_number ?? 0) + 1;

    const { data: order, error: orderErr } = await admin
      .from('service_orders')
      .insert({
        business_id:  businessId,
        order_number: orderNumber,
        client_name:  body.client_name  ?? null,
        client_phone: body.client_phone ?? null,
        subject_ref:  body.subject_ref  ?? null,
        subject_type: body.subject_type ?? null,
        subject_info: body.subject_info ?? null,
        assigned_to:  body.assigned_to  ?? null,
        notes:        body.notes        ?? null,
        status:       'attente',
        total,
        paid_amount:  0,
      })
      .select('id')
      .single();

    if (orderErr) return apiError(orderErr.message, 502);

    const { error: itemsErr } = await admin
      .from('service_order_items')
      .insert(resolvedItems.map((item) => ({ ...item, order_id: order.id })));

    if (itemsErr) return apiError(itemsErr.message, 502);

    const { data: full } = await admin
      .from('service_orders')
      .select('*, items:service_order_items(*), payments:service_order_payments(*)')
      .eq('id', order.id)
      .single();

    return Response.json({ data: full }, { status: 201, headers: corsHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
