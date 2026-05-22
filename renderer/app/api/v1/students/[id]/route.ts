import { NextRequest } from 'next/server';
import { validateApiKey, getApiKey, apiError, handleAuthError, corsHeaders } from '@/lib/api-v1-auth';
import { getSupabaseAdmin as getAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { businessId } = await validateApiKey(getApiKey(request), 'read:students');
    const { id } = await params;
    const admin = getAdmin();

    const { data, error } = await admin
      .from('edu_students')
      .select('*, classroom:edu_classrooms(id, name)')
      .eq('id', id)
      .eq('business_id', businessId)
      .maybeSingle();

    if (error) return apiError(error.message, 502);
    if (!data) return apiError('Student not found.', 404);

    return Response.json({ data }, { headers: corsHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
