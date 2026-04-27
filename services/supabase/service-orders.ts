import { supabase as _supabase } from './client';
const db = _supabase as any;

// ── Types ────────────────────────────────────────────────────────────────────

export type ServiceOrderStatus = 'attente' | 'en_cours' | 'termine' | 'paye' | 'annule';

export type ServiceCategory = 'lavage' | 'vidange' | 'mecanique' | 'autre';

// Types de sujets — libres, exemples courants fournis mais non limitatifs
export type SubjectType = 'vehicule' | 'appareil' | 'billet' | 'client' | 'autre';

export interface ServiceCatalogItem {
  id:           string;
  business_id:  string;
  name:         string;
  category:     ServiceCategory;
  price:        number;
  duration_min: number | null;
  is_active:    boolean;
  sort_order:   number;
}

// Sujet de service générique (véhicule, appareil électronique, billet, client…)
export interface ServiceSubject {
  id:          string;
  business_id: string;
  client_id?:  string | null;
  reference:   string;              // identifiant principal (plaque, n° série, nom, n° billet…)
  type_sujet:  SubjectType;
  designation?: string | null;      // description libre (Toyota Corolla / iPhone 12 / DKR→CDG)
  notes?:      string | null;
  created_at:  string;
}

export interface ServiceOrderItem {
  id:         string;
  order_id:   string;
  service_id: string | null;
  name:       string;
  price:      number;
  quantity:   number;
  total:      number;
}

export interface ServiceOrder {
  id:              string;
  business_id:     string;
  order_number:    number;
  subject_id?:     string | null;
  subject_ref?:    string | null;   // référence du sujet (plaque, n° série…)
  subject_type?:   string | null;   // type du sujet
  subject_info?:   string | null;   // description du sujet
  client_name?:    string | null;
  client_phone?:   string | null;
  status:          ServiceOrderStatus;
  total:           number;
  paid_amount:     number;
  payment_method?: string | null;
  notes?:          string | null;
  started_at?:     string | null;
  finished_at?:    string | null;
  paid_at?:        string | null;
  created_at:      string;
  items?:          ServiceOrderItem[];
}

// ── Catalogue ────────────────────────────────────────────────────────────────

export async function getServiceCatalog(businessId: string): Promise<ServiceCatalogItem[]> {
  const { data, error } = await db
    .from('service_catalog')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('sort_order')
    .order('name');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getAllServiceCatalog(businessId: string): Promise<ServiceCatalogItem[]> {
  const { data, error } = await db
    .from('service_catalog')
    .select('*')
    .eq('business_id', businessId)
    .order('sort_order')
    .order('name');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function upsertServiceCatalogItem(
  businessId: string,
  input: { id?: string; name: string; category: ServiceCategory; price: number; duration_min?: number | null; sort_order?: number }
): Promise<ServiceCatalogItem> {
  const payload: any = {
    business_id:  businessId,
    name:         input.name.trim(),
    category:     input.category,
    price:        input.price,
    duration_min: input.duration_min ?? null,
    sort_order:   input.sort_order ?? 0,
    is_active:    true,
  };
  if (input.id) payload.id = input.id;
  const { data, error } = await db.from('service_catalog').upsert(payload, { onConflict: 'id' }).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function toggleServiceCatalogItem(id: string, isActive: boolean): Promise<void> {
  const { error } = await db.from('service_catalog').update({ is_active: isActive }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteServiceCatalogItem(id: string): Promise<void> {
  const { error } = await db.from('service_catalog').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Sujets de service ────────────────────────────────────────────────────────

export async function searchSubjects(businessId: string, ref: string): Promise<ServiceSubject[]> {
  const { data, error } = await db
    .from('service_subjects')
    .select('*')
    .eq('business_id', businessId)
    .ilike('reference', `%${ref}%`)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getSubjectHistory(businessId: string, subjectId: string): Promise<ServiceOrder[]> {
  const { data, error } = await db
    .from('service_orders')
    .select('*, items:service_order_items(*)')
    .eq('business_id', businessId)
    .eq('subject_id', subjectId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getSubjects(businessId: string): Promise<ServiceSubject[]> {
  const { data, error } = await db
    .from('service_subjects')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function upsertSubject(
  businessId: string,
  input: { reference: string; type_sujet: SubjectType; designation?: string }
): Promise<ServiceSubject> {
  const { data: existing } = await db
    .from('service_subjects')
    .select('id')
    .eq('business_id', businessId)
    .eq('reference', input.reference.trim())
    .maybeSingle();

  const payload: any = {
    business_id:  businessId,
    reference:    input.reference.trim(),
    type_sujet:   input.type_sujet,
    designation:  input.designation?.trim() || null,
  };
  if (existing?.id) payload.id = existing.id;

  const { data, error } = await db
    .from('service_subjects')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ── Ordres de travail ────────────────────────────────────────────────────────

export async function getServiceOrders(
  businessId: string,
  opts?: { date?: string; status?: ServiceOrderStatus | 'all' }
): Promise<ServiceOrder[]> {
  let q = db
    .from('service_orders')
    .select('*, items:service_order_items(*)')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (opts?.status && opts.status !== 'all') {
    q = q.eq('status', opts.status);
  }
  if (opts?.date) {
    q = q.gte('created_at', `${opts.date}T00:00:00Z`).lte('created_at', `${opts.date}T23:59:59Z`);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export interface CreateServiceOrderInput {
  businessId:    string;
  subjectRef?:   string;              // identifiant du sujet (plaque, n° série, nom…)
  subjectType?:  SubjectType;
  subjectInfo?:  string;             // description du sujet
  clientName?:   string;
  clientPhone?:  string;
  notes?:        string;
  createdBy?:    string;
  items: Array<{ service_id?: string | null; name: string; price: number; quantity: number }>;
}

export async function createServiceOrder(input: CreateServiceOrderInput): Promise<ServiceOrder> {
  let subjectId: string | null = null;
  if (input.subjectRef?.trim()) {
    const subject = await upsertSubject(input.businessId, {
      reference:   input.subjectRef,
      type_sujet:  input.subjectType ?? 'autre',
      designation: input.subjectInfo,
    });
    subjectId = subject.id;
  }

  const total = input.items.reduce((s, i) => s + i.price * i.quantity, 0);

  const { data: order, error: orderErr } = await db
    .from('service_orders')
    .insert({
      business_id:   input.businessId,
      subject_id:    subjectId,
      subject_ref:   input.subjectRef?.trim() || null,
      subject_type:  input.subjectType ?? null,
      subject_info:  input.subjectInfo?.trim() || null,
      client_name:   input.clientName?.trim() || null,
      client_phone:  input.clientPhone?.trim() || null,
      notes:         input.notes?.trim() || null,
      created_by:    input.createdBy ?? null,
      total,
      paid_amount:   0,
      status:        'attente',
    })
    .select()
    .single();
  if (orderErr) throw new Error(orderErr.message);

  if (input.items.length > 0) {
    const { error: itemErr } = await db.from('service_order_items').insert(
      input.items.map(i => ({
        order_id:   order.id,
        service_id: i.service_id ?? null,
        name:       i.name,
        price:      i.price,
        quantity:   i.quantity,
        total:      i.price * i.quantity,
      }))
    );
    if (itemErr) throw new Error(itemErr.message);
  }

  return {
    ...order,
    items: input.items.map((i, idx) => ({
      id: idx + '', order_id: order.id, service_id: i.service_id ?? null,
      name: i.name, price: i.price, quantity: i.quantity, total: i.price * i.quantity,
    })),
  };
}

export async function updateServiceOrderStatus(
  id: string,
  status: ServiceOrderStatus
): Promise<void> {
  const updates: any = { status };
  if (status === 'en_cours') updates.started_at  = new Date().toISOString();
  if (status === 'termine')  updates.finished_at = new Date().toISOString();
  if (status === 'paye')     updates.paid_at     = new Date().toISOString();
  const { error } = await db.from('service_orders').update(updates).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function payServiceOrder(
  id: string,
  amount: number,
  paymentMethod: string
): Promise<void> {
  const { error } = await db.from('service_orders').update({
    status:         'paye',
    paid_amount:    amount,
    payment_method: paymentMethod,
    paid_at:        new Date().toISOString(),
  }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function updateServiceOrder(
  id: string,
  input: {
    subjectRef?:  string; subjectType?: string; subjectInfo?: string;
    clientName?:  string; clientPhone?: string; notes?: string;
    items?: Array<{ service_id?: string | null; name: string; price: number; quantity: number }>;
  }
): Promise<void> {
  const updates: any = {};
  if (input.subjectRef  !== undefined) updates.subject_ref  = input.subjectRef?.trim()  || null;
  if (input.subjectType !== undefined) updates.subject_type = input.subjectType          || null;
  if (input.subjectInfo !== undefined) updates.subject_info = input.subjectInfo?.trim()  || null;
  if (input.clientName  !== undefined) updates.client_name  = input.clientName?.trim()   || null;
  if (input.clientPhone !== undefined) updates.client_phone = input.clientPhone?.trim()  || null;
  if (input.notes       !== undefined) updates.notes        = input.notes?.trim()        || null;

  if (input.items !== undefined) {
    const total = input.items.reduce((s, i) => s + i.price * i.quantity, 0);
    updates.total = total;
    await db.from('service_order_items').delete().eq('order_id', id);
    if (input.items.length > 0) {
      await db.from('service_order_items').insert(
        input.items.map(i => ({
          order_id:   id,
          service_id: i.service_id ?? null,
          name:       i.name,
          price:      i.price,
          quantity:   i.quantity,
          total:      i.price * i.quantity,
        }))
      );
    }
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await db.from('service_orders').update(updates).eq('id', id);
    if (error) throw new Error(error.message);
  }
}

export async function cancelServiceOrder(id: string): Promise<void> {
  const { error } = await db.from('service_orders').update({ status: 'annule' }).eq('id', id);
  if (error) throw new Error(error.message);
}
