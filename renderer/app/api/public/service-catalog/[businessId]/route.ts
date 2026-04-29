import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(
  _req: Request,
  { params }: { params: { businessId: string } }
) {
  try {
    if (!serviceKey) {
      // Fallback: anon key (works si RLS autorise la lecture publique)
      const anon = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { data, error } = await (anon as any)
        .from('service_catalog')
        .select('*, service_category:service_categories(id, name, color)')
        .eq('business_id', params.businessId)
        .eq('is_active', true)
        .order('sort_order')
        .order('name');
      if (error) throw error;
      return NextResponse.json(data ?? []);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await (admin as any)
      .from('service_catalog')
      .select('*, service_category:service_categories(id, name, color)')
      .eq('business_id', params.businessId)
      .eq('is_active', true)
      .order('sort_order')
      .order('name');

    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
