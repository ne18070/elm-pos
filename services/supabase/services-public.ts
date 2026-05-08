import { supabasePublic as db } from './public-client';

export async function getPublicServiceCatalog(businessId: string) {
  const { data, error } = await db
    .from('service_catalog')
    .select('*, category:service_categories(id, name, color)')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('sort_order')
    .order('name');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createPublicServiceOrder(input: {
  businessId:    string;
  subjectRef?:   string;
  subjectType?:  string;
  subjectInfo?:  string;
  clientName:    string;
  clientPhone:   string;
  notes?:        string;
  items: Array<{ service_id: string; name: string; price: number; quantity: number }>;
}) {
  const { data, error } = await (db as any).rpc('create_public_service_order', {
    p_business_id:  input.businessId,
    p_client_name:  input.clientName.trim(),
    p_client_phone: input.clientPhone.trim(),
    p_subject_ref:  input.subjectRef?.trim()  || null,
    p_subject_type: input.subjectType         || 'autre',
    p_subject_info: input.subjectInfo?.trim() || null,
    p_notes:        input.notes?.trim()       || null,
    p_items:        input.items,
  });
  if (error) throw new Error(error.message);
  return data as { id: string; order_number: number; status: string; total: number };
}
