import { supabasePublic as db } from './public-client';
import { upsertClientByPhone } from './clients';

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
  // Enregistre / met à jour le client automatiquement (dédup par téléphone)
  if (input.clientName?.trim() && input.clientPhone?.trim()) {
    upsertClientByPhone(input.businessId, input.clientName, input.clientPhone);
  }

  const total = input.items.reduce((s, i) => s + i.price * i.quantity, 0);

  // 1. Créer l'OT (Ordre de Travail)
  const { data: order, error: orderErr } = await db
    .from('service_orders')
    .insert({
      business_id:   input.businessId,
      subject_ref:   input.subjectRef?.trim() || null,
      subject_type:  input.subjectType || 'autre',
      subject_info:  input.subjectInfo?.trim() || null,
      client_name:   input.clientName.trim(),
      client_phone:  input.clientPhone.trim(),
      notes:         input.notes?.trim() || null,
      total,
      paid_amount:   0,
      status:        'attente',
      source:        'public',
    })
    .select()
    .single();

  if (orderErr) throw new Error(orderErr.message);

  // 2. Insérer les items
  if (input.items.length > 0) {
    const { error: itemErr } = await db.from('service_order_items').insert(
      input.items.map(i => ({
        order_id:   order.id,
        service_id: i.service_id,
        name:       i.name,
        price:      i.price,
        quantity:   i.quantity,
        total:      i.price * i.quantity,
      }))
    );
    if (itemErr) throw new Error(itemErr.message);
  }

  return order;
}
