import { NextRequest } from 'next/server';
import { validateApiKey, getApiKey, apiError, handleAuthError, corsHeaders } from '@/lib/api-v1-auth';
import { getSupabaseAdmin as getAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: NextRequest) {
  try {
    const { businessId } = await validateApiKey(getApiKey(request), 'read:students');
    const admin = getAdmin();
    const sp = request.nextUrl.searchParams;
    const page        = Math.max(1, parseInt(sp.get('page')  ?? '1', 10));
    const limit       = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '50', 10)));
    const classroomId = sp.get('classroom_id') ?? '';
    const status      = sp.get('status')       ?? '';

    let query = admin
      .from('edu_students')
      .select('*, classroom:edu_classrooms(id, name)', { count: 'exact' })
      .eq('business_id', businessId)
      .order('last_name')
      .range((page - 1) * limit, page * limit - 1);

    if (classroomId) query = query.eq('classroom_id', classroomId);
    if (status)      query = query.eq('status', status);

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
    const { businessId } = await validateApiKey(getApiKey(request), 'write:students');
    const admin = getAdmin();

    let body: {
      first_name?: string;
      last_name?: string;
      classroom_id?: string;
      parent_phone?: string;
      parent_name?: string;
      gender?: string;
      birth_date?: string;
    };
    try {
      body = await request.json();
    } catch {
      return apiError('Invalid JSON body.', 400);
    }

    if (!body.first_name?.trim() || !body.last_name?.trim()) {
      return apiError('"first_name" and "last_name" are required.', 400);
    }

    const { data, error } = await admin
      .from('edu_students')
      .insert({
        business_id:  businessId,
        first_name:   body.first_name.trim(),
        last_name:    body.last_name.trim(),
        classroom_id: body.classroom_id  ?? null,
        parent_phone: body.parent_phone  ?? null,
        parent_name:  body.parent_name   ?? null,
        gender:       body.gender        ?? null,
        birth_date:   body.birth_date    ?? null,
        status:       'active',
      })
      .select()
      .single();

    if (error) return apiError(error.message, 502);

    return Response.json({ data }, { status: 201, headers: corsHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
