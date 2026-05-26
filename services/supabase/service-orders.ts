import { supabase } from './client';
import { syncServiceOrdersAccounting } from './accounting';
import { logAction } from './logger';
import { upsertClientByPhone } from './clients';
import { getLoyaltyConfig, earnPoints } from './loyalty';

type ServiceOrderActor = { userId?: string; userName?: string; role?: string };

// ── Types ────────────────────────────────────────────────────────────────────

export type ServiceOrderStatus = 'attente' | 'en_cours' | 'pause' | 'termine' | 'paye' | 'annule';

export interface ServiceOrderPayment {
  id:          string;
  order_id:    string;
  business_id: string;
  amount:      number;
  method:      string;
  paid_at:     string;
}

export interface ServiceCategory {
  id:          string;
  business_id: string;
  name:        string;
  color:       string;
  sort_order:  number;
}

// Types de sujets — libres, exemples courants fournis mais non limitatifs
export type SubjectType = 'vehicule' | 'appareil' | 'billet' | 'client' | 'autre';

export interface ServiceCatalogItem {
  id:           string;
  business_id:  string;
  name:         string;
  description?: string | null;
  category_id:  string | null;
  category?:    string; // champ texte legacy
  service_category?: { id: string; name: string; color?: string } | null;
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
  subject_ref?:    string | null;
  subject_type?:   string | null;
  subject_info?:   string | null;
  client_name?:    string | null;
  client_phone?:   string | null;
  assigned_to?:    string | null;   // staff.id
  assigned_name?:  string | null;   // dénormalisé pour affichage rapide
  status:          ServiceOrderStatus;
  total:           number;
  paid_amount:     number;
  payment_method?: string | null;
  notes?:          string | null;
  started_at?:      string | null;
  finished_at?:     string | null;
  paid_at?:         string | null;
  created_at:       string;
  client_rating?:   number | null;
  client_feedback?: string | null;
  items?:           ServiceOrderItem[];
  payments?:        ServiceOrderPayment[];
}

export interface TechnicianServiceOrderItem {
  id: string;
  name: string;
  quantity: number;
}

export interface TechnicianServiceOrder {
  id: string;
  order_number: number;
  status: ServiceOrderStatus;
  subject_ref: string | null;
  subject_type: string | null;
  subject_info: string | null;
  client_name: string | null;
  notes: string | null;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  items: TechnicianServiceOrderItem[];
}

export interface TechnicianWorkspaceData {
  business: { name: string; logo_url: string | null };
  technician: { id: string; name: string };
  orders: TechnicianServiceOrder[];
}

// ── Catalogue ────────────────────────────────────────────────────────────────

export async function getServiceCategories(businessId: string): Promise<ServiceCategory[]> {
  const { data, error } = await supabase
    .from('service_categories')
    .select('*')
    .eq('business_id', businessId)
    .order('sort_order')
    .order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ServiceCategory[];
}

export async function upsertServiceCategory(
  businessId: string,
  input: { id?: string; name: string; color?: string; sort_order?: number }
): Promise<ServiceCategory> {
  const payload: any = {
    business_id: businessId,
    name:        input.name.trim(),
    color:       input.color || 'bg-slate-500/20 text-slate-300',
    sort_order:  input.sort_order ?? 0,
  };
  if (input.id) payload.id = input.id;
  const { data, error } = await supabase.from('service_categories').upsert(payload).select().single();
  if (error) throw new Error(error.message);
  return data as unknown as ServiceCategory;
}

export async function deleteServiceCategory(id: string): Promise<void> {
  const { error } = await supabase.from('service_categories').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function getServiceCatalog(businessId: string): Promise<ServiceCatalogItem[]> {
  const { data, error } = await supabase
    .from('service_catalog')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('sort_order')
    .order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ServiceCatalogItem[];
}

export async function getAllServiceCatalog(businessId: string): Promise<ServiceCatalogItem[]> {
  const { data, error } = await supabase
    .from('service_catalog')
    .select('*, service_category:service_categories(id, name, color)')
    .eq('business_id', businessId)
    .order('sort_order')
    .order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ServiceCatalogItem[];
}

export async function upsertServiceCatalogItem(
  businessId: string,
  input: { id?: string; name: string; description?: string | null; category_id: string | null; price: number; duration_min?: number | null; sort_order?: number }
): Promise<ServiceCatalogItem> {
  const payload: any = {
    business_id:  businessId,
    name:         input.name.trim(),
    description:  input.description?.trim() || null,
    category_id:  input.category_id,
    price:        input.price,
    duration_min: input.duration_min ?? null,
    sort_order:   input.sort_order ?? 0,
    is_active:    true,
  };
  if (input.id) payload.id = input.id;
  const { data, error } = await supabase.from('service_catalog').upsert(payload, { onConflict: 'id' }).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function toggleServiceCatalogItem(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('service_catalog').update({ is_active: isActive }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteServiceCatalogItem(id: string): Promise<void> {
  const { error } = await supabase.from('service_catalog').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Résumé léger de tous les ordres (pour historique) ────────────────────────

export interface ServiceOrderSummary {
  id:           string;
  order_number: number;
  subject_id:   string | null;
  subject_ref:  string | null;
  subject_type: string | null;
  subject_info: string | null;
  client_name:  string | null;
  client_phone: string | null;
  status:       ServiceOrderStatus;
  total:        number;
  paid_amount:  number;
  created_at:   string;
}

export async function getOrdersSummary(businessId: string): Promise<ServiceOrderSummary[]> {
  const { data, error } = await supabase
    .from('service_orders')
    .select('id, order_number, subject_id, subject_ref, subject_type, subject_info, client_name, client_phone, status, total, paid_amount, created_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ServiceOrderSummary[];
}

export async function getOrdersByClientName(businessId: string, clientName: string): Promise<ServiceOrder[]> {
  const { data, error } = await supabase
    .from('service_orders')
    .select('*, items:service_order_items(*), payments:service_order_payments(id, amount, method, paid_at)')
    .eq('business_id', businessId)
    .eq('client_name', clientName)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ServiceOrder[];
}

// ── Sujets de service ────────────────────────────────────────────────────────

export async function searchSubjects(businessId: string, ref: string): Promise<ServiceSubject[]> {
  const { data, error } = await supabase
    .from('service_subjects')
    .select('*')
    .eq('business_id', businessId)
    .ilike('reference', `%${ref}%`)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ServiceSubject[];
}

export async function getClientVisitStats(
  businessId: string,
  clientNames: string[]
): Promise<Map<string, { count: number; lastVisit: string | null }>> {
  if (!clientNames.length) return new Map();
  const { data } = await supabase
    .from('service_orders')
    .select('client_name, created_at')
    .eq('business_id', businessId)
    .in('client_name', clientNames)
    .order('created_at', { ascending: false });

  const stats = new Map<string, { count: number; lastVisit: string | null }>();
  for (const o of (data ?? []) as { client_name: string; created_at: string }[]) {
    const key = o.client_name?.toLowerCase().trim();
    if (!key) continue;
    const s = stats.get(key) ?? { count: 0, lastVisit: null };
    s.count++;
    if (!s.lastVisit) s.lastVisit = o.created_at;
    stats.set(key, s);
  }
  return stats;
}

export async function getSubjectHistory(businessId: string, subjectId: string): Promise<ServiceOrder[]> {
  const { data, error } = await supabase
    .from('service_orders')
    .select('*, items:service_order_items(*), payments:service_order_payments(id, amount, method, paid_at)')
    .eq('business_id', businessId)
    .eq('subject_id', subjectId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ServiceOrder[];
}

export async function getSubjects(businessId: string): Promise<ServiceSubject[]> {
  const { data, error } = await supabase
    .from('service_subjects')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ServiceSubject[];
}

async function upsertSubject(
  businessId: string,
  input: { reference: string; type_sujet: SubjectType; designation?: string }
): Promise<ServiceSubject> {
  const { data: existing } = await supabase
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

  const { data, error } = await supabase
    .from('service_subjects')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as ServiceSubject;
}

// ── Ordres de travail ────────────────────────────────────────────────────────

export async function getServiceOrders(
  businessId: string,
  opts?: { date?: string; status?: ServiceOrderStatus | 'all'; search?: string; page?: number; pageSize?: number }
): Promise<{ data: ServiceOrder[]; count: number }> {
  const page = Math.max(1, opts?.page ?? 1);
  const pageSize = Math.max(1, opts?.pageSize ?? 25);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let q = supabase
    .from('service_orders')
    .select('*, items:service_order_items(id, name, quantity)', { count: 'exact' })
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (opts?.status && opts.status !== 'all') {
    q = q.eq('status', opts.status);
  }
  if (opts?.date) {
    q = q.gte('created_at', `${opts.date}T00:00:00Z`).lte('created_at', `${opts.date}T23:59:59Z`);
  }
  if (opts?.search?.trim()) {
    const term = opts.search.trim().replace(/[%_,]/g, ' ');
    q = q.or(`subject_ref.ilike.%${term}%,subject_info.ilike.%${term}%,client_name.ilike.%${term}%,client_phone.ilike.%${term}%`);
  }

  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  return { data: (data ?? []) as unknown as ServiceOrder[], count: count ?? 0 };
}

export interface ServiceOrderClient {
  name:        string;
  phone:       string;
  lastRef:     string;
  lastService: string;
  lastStatus:  string;
  lastTotal:   number;
}

/** Retourne la liste dédupliquée des clients ayant au moins un OT, avec leur dernier OT. */
export async function getDistinctServiceClients(businessId: string): Promise<ServiceOrderClient[]> {
  const { data, error } = await supabase
    .from('service_orders')
    .select('client_name, client_phone, order_number, status, total, items:service_order_items(name)')
    .eq('business_id', businessId)
    .not('client_phone', 'is', null)
    .not('client_name', 'is', null)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error || !data) return [];
  const seen = new Map<string, ServiceOrderClient>();
  for (const row of data) {
    if (!row.client_phone || seen.has(row.client_phone)) continue;
    seen.set(row.client_phone, {
      name:        row.client_name ?? '',
      phone:       row.client_phone,
      lastRef:     `OT-${String(row.order_number).padStart(4, '0')}`,
      lastService: (row.items as { name: string }[])?.[0]?.name ?? '',
      lastStatus:  row.status,
      lastTotal:   row.total ?? 0,
    });
  }
  return Array.from(seen.values());
}

/** Retourne le nombre d'OT "en_cours" démarrés avant il y a `days` jours calendaires. */
export async function getStaleOrderCount(businessId: string, days = 3): Promise<number> {
  // Comparer par jour calendaire UTC : seuil=1 → tout OT démarré avant aujourd'hui (minuit UTC)
  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - (days - 1));
  const { count, error } = await supabase
    .from('service_orders')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('status', 'en_cours')
    .not('started_at', 'is', null)
    .lt('started_at', cutoff.toISOString());
  if (error) return 0;
  return count ?? 0;
}

export async function getServiceOrderById(id: string): Promise<ServiceOrder | null> {
  const { data, error } = await supabase
    .from('service_orders')
    .select('*, items:service_order_items(*), payments:service_order_payments(id, amount, method, paid_at)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as unknown as ServiceOrder | null;
}

export async function getServiceOrderCounts(
  businessId: string,
  opts?: { date?: string; search?: string }
): Promise<Record<ServiceOrderStatus | 'all', number>> {
  const { data, error } = await supabase.rpc('get_service_order_counts', {
    p_business_id: businessId,
    p_date:        opts?.date   || undefined,
    p_search:      opts?.search?.trim().replace(/[%_,]/g, ' ') || undefined,
  });
  if (error) throw new Error(error.message);

  const raw = (data ?? {}) as Partial<Record<ServiceOrderStatus, number>>;
  const all = (Object.values(raw) as number[]).reduce((s, n) => s + n, 0);
  return {
    all,
    attente:  raw.attente  ?? 0,
    en_cours: raw.en_cours ?? 0,
    pause:    raw.pause    ?? 0,
    termine:  raw.termine  ?? 0,
    paye:     raw.paye     ?? 0,
    annule:   raw.annule   ?? 0,
  };
}

export interface CreateServiceOrderInput {
  businessId:    string;
  subjectRef?:   string;
  subjectType?:  SubjectType;
  subjectInfo?:  string;
  clientName?:   string;
  clientPhone?:  string;
  assignedTo?:   string;   // staff.id
  assignedName?: string;   // staff.name (dénormalisé)
  notes?:        string;
  createdBy?:    string;
  createdByName?: string;
  items: Array<{ service_id?: string | null; name: string; price: number; quantity: number }>;
}

export async function createServiceOrder(input: CreateServiceOrderInput): Promise<ServiceOrder> {
  // Enregistre / met à jour le client automatiquement (dédup par téléphone)
  if (input.clientName?.trim() && input.clientPhone?.trim()) {
    upsertClientByPhone(input.businessId, input.clientName, input.clientPhone);
  }

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

  const { data: order, error: orderErr } = await supabase
    .from('service_orders')
    .insert({
      business_id:   input.businessId,
      subject_id:    subjectId,
      subject_ref:   input.subjectRef?.trim() || null,
      subject_type:  input.subjectType ?? null,
      subject_info:  input.subjectInfo?.trim() || null,
      client_name:   input.clientName?.trim() || null,
      client_phone:  input.clientPhone?.trim() || null,
      assigned_to:   input.assignedTo ?? null,
      assigned_name: input.assignedName ?? null,
      notes:         input.notes?.trim() || null,
      created_by:    input.createdBy ?? null,
      total,
      paid_amount:   0,
      status:        'attente',
    } as unknown as import('./database.types').TablesInsert<'service_orders'>)
    .select()
    .single();
  if (orderErr) throw new Error(orderErr.message);

  if (input.items.length > 0) {
    const { error: itemErr } = await supabase.from('service_order_items').insert(
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

  logAction({
    business_id: input.businessId,
    action:      'service_order.created',
    entity_type: 'service_order',
    entity_id:   order.id,
    user_id:     input.createdBy,
    user_name:   input.createdByName,
    metadata: {
      order_number: order.order_number,
      total,
      items_count: input.items.length,
      subject_ref: input.subjectRef ?? null,
      client_name: input.clientName ?? null,
    },
  });

  return {
    ...order,
    items: input.items.map((i, idx) => ({
      id: idx + '', order_id: order.id, service_id: i.service_id ?? null,
      name: i.name, price: i.price, quantity: i.quantity, total: i.price * i.quantity,
    })),
  } as unknown as ServiceOrder;
}

export async function updateServiceOrderStatus(
  id: string,
  status: ServiceOrderStatus,
  actor?: ServiceOrderActor
): Promise<void> {
  // Timestamps (started_at, finished_at, paid_at) are set by the DB trigger
  // trg_service_order_status_timestamps using NOW() — never use new Date() here
  // because the client clock can be wrong (wrong system time, etc.)
  const updates: any = { status };
  const { data: order, error } = await supabase
    .from('service_orders')
    .update(updates)
    .eq('id', id)
    .select('id, business_id, order_number, status')
    .single();
  if (error) throw new Error(error.message);

  if (order) {
    logAction({
      business_id: order.business_id,
      action:      'service_order.status_updated',
      entity_type: 'service_order',
      entity_id:   id,
      user_id:     actor?.userId,
      user_name:   actor?.userName,
      metadata:    { order_number: order.order_number, status },
    });
  }
}

export async function getOrCreateServiceTechnicianToken(
  businessId: string,
  serviceOrderId: string,
  staffId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('get_or_create_service_technician_token', {
    p_business_id: businessId,
    p_service_order_id: serviceOrderId,
    p_staff_id: staffId,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function getTechnicianServiceOrders(token: string): Promise<TechnicianWorkspaceData> {
  const { data, error } = await supabase.rpc('get_technician_service_orders', { p_token: token });
  if (error) throw new Error(error.message);
  const result = data as unknown as (TechnicianWorkspaceData & { error?: string }) | null;
  if (!result || result.error) {
    throw new Error(result?.error === 'expired_token' ? 'Lien expiré' : 'Lien invalide');
  }
  return result;
}

export async function updateTechnicianServiceOrderStatus(
  token: string,
  orderId: string,
  status: Extract<ServiceOrderStatus, 'en_cours' | 'pause' | 'termine'>,
): Promise<void> {
  const { data, error } = await supabase.rpc('update_technician_service_order_status', {
    p_token: token,
    p_order_id: orderId,
    p_status: status,
  });
  if (error) throw new Error(error.message);
  const res = data as unknown as { success?: boolean; error?: string } | null;
  if (!res?.success) {
    const code = res?.error;
    if (code === 'invalid_transition') throw new Error('Transition non autorisée');
    if (code === 'closed_order') throw new Error("Cet ordre de travail n'est plus modifiable");
    if (code === 'not_assigned') throw new Error("Cet ordre de travail n'est plus assigné à ce technicien");
    throw new Error(code === 'expired_token' ? 'Lien expiré' : 'Action refusée');
  }
}

export async function payServiceOrder(
  id: string,
  amount: number,
  paymentMethod: string,
  actor?: ServiceOrderActor
): Promise<{ isFullyPaid: boolean; loyaltyError?: string }> {
  // Atomic: lock row + update order + insert payment in one DB transaction
  const { data, error } = await supabase.rpc('pay_service_order', {
    p_id:     id,
    p_amount: amount,
    p_method: paymentMethod,
  });
  if (error) throw new Error(error.message);

  const result = data as {
    id: string; business_id: string; order_number: number;
    total: number; new_paid_amount: number; is_fully_paid: boolean;
    client_name: string | null; client_phone: string | null;
  };

  // Side-effects run after the transaction commits — failures don't affect payment
  let loyaltyError: string | undefined;
  if (result.is_fully_paid) {
    // Accounting sync: fire-and-forget
    syncServiceOrdersAccounting(result.business_id).catch(e =>
      console.warn('[service-orders] accounting sync failed', e)
    );

    // Loyalty: surface the error to the caller instead of swallowing it
    if (result.client_name) {
      try {
        const cfg = await getLoyaltyConfig(result.business_id);
        await earnPoints(result.business_id, result.client_name, result.client_phone ?? null, result.total, cfg, id);
      } catch (e: any) {
        loyaltyError = e?.message ?? 'Erreur attribution points';
      }
    }
  }

  logAction({
    business_id: result.business_id,
    action:      result.is_fully_paid ? 'service_order.paid' : 'service_order.acompte',
    entity_type: 'service_order',
    entity_id:   id,
    user_id:     actor?.userId,
    user_name:   actor?.userName,
    metadata: {
      order_number:   result.order_number,
      amount,
      payment_method: paymentMethod,
      total:          result.total,
      paid_amount:    result.new_paid_amount,
      client_name:    result.client_name ?? null,
    },
  });

  return { isFullyPaid: result.is_fully_paid, loyaltyError };
}

export async function updateServiceOrder(
  id: string,
  input: {
    subjectRef?:  string; subjectType?: string; subjectInfo?: string;
    clientName?:  string; clientPhone?: string;
    assignedTo?:  string | null; assignedName?: string | null;
    notes?: string;
    items?: Array<{ service_id?: string | null; name: string; price: number; quantity: number }>;
  },
  actor?: ServiceOrderActor
): Promise<void> {
  const { data: before, error: beforeErr } = await supabase
    .from('service_orders')
    .select('id, business_id, order_number, status, total, paid_amount, payment_method, subject_ref, subject_type, subject_info, client_name, client_phone, notes')
    .eq('id', id)
    .single();
  if (beforeErr) throw new Error(beforeErr.message);

  if (before?.status === 'paye' && actor?.role !== 'owner') {
    throw new Error('Seul le proprietaire peut modifier une facture payee');
  }

  let previousItems: Array<{ service_id: string | null; name: string; price: number; quantity: number; total: number }> = [];
  if (input.items !== undefined) {
    const { data: itemsData, error: itemsErr } = await supabase
      .from('service_order_items')
      .select('service_id, name, price, quantity, total')
      .eq('order_id', id)
      .order('id');
    if (itemsErr) throw new Error(itemsErr.message);
    previousItems = (itemsData ?? []) as typeof previousItems;
  }

  const updates: any = {};
  if (input.subjectRef  !== undefined) updates.subject_ref  = input.subjectRef?.trim()  || null;
  if (input.subjectType !== undefined) updates.subject_type = input.subjectType          || null;
  if (input.subjectInfo !== undefined) updates.subject_info = input.subjectInfo?.trim()  || null;
  if (input.clientName  !== undefined) updates.client_name  = input.clientName?.trim()   || null;
  if (input.clientPhone !== undefined) updates.client_phone = input.clientPhone?.trim()  || null;
  if (input.assignedTo  !== undefined) updates.assigned_to  = input.assignedTo           ?? null;
  if (input.assignedName !== undefined) updates.assigned_name = input.assignedName       ?? null;
  if (input.notes       !== undefined) updates.notes        = input.notes?.trim()        || null;

  if (input.items !== undefined) {
    const total = input.items.reduce((s, i) => s + i.price * i.quantity, 0);
    updates.total = total;
    if (before?.status === 'paye') updates.paid_amount = total;
    await supabase.from('service_order_items').delete().eq('order_id', id);
    if (input.items.length > 0) {
      await supabase.from('service_order_items').insert(
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
    const { data: order, error } = await supabase
      .from('service_orders')
      .update(updates)
      .eq('id', id)
      .select('id, business_id, order_number, status, total, paid_amount, subject_ref, subject_type, subject_info, client_name, client_phone, notes')
      .single();
    if (error) throw new Error(error.message);

    if (order) {
      if (before?.status === 'paye') {
        try {
          await syncServiceOrdersAccounting(order.business_id);
        } catch (syncError) {
          console.warn('[service-orders] accounting resync failed', syncError);
        }
      }

      const changes: Record<string, { before: unknown; after: unknown }> = {};
      const track = (key: string, prev: unknown, next: unknown) => {
        if (JSON.stringify(prev ?? null) !== JSON.stringify(next ?? null)) {
          changes[key] = { before: prev ?? null, after: next ?? null };
        }
      };
      track('subject_ref', before?.subject_ref, order.subject_ref);
      track('subject_type', before?.subject_type, order.subject_type);
      track('subject_info', before?.subject_info, order.subject_info);
      track('client_name', before?.client_name, order.client_name);
      track('client_phone', before?.client_phone, order.client_phone);
      track('notes', before?.notes, order.notes);
      track('total', before?.total, order.total);
      track('paid_amount', before?.paid_amount, order.paid_amount);
      if (input.items !== undefined) {
        track('items', previousItems, input.items.map(i => ({
          service_id: i.service_id ?? null,
          name:       i.name,
          price:      i.price,
          quantity:   i.quantity,
          total:      i.price * i.quantity,
        })));
      }

      logAction({
        business_id: order.business_id,
        action:      'service_order.updated',
        entity_type: 'service_order',
        entity_id:   id,
        user_id:     actor?.userId,
        user_name:   actor?.userName,
        metadata:    {
          order_number: order.order_number,
          status: order.status,
          paid_invoice: before?.status === 'paye',
          total: order.total,
          changes,
        },
      });
    }
  }
}

export async function cancelServiceOrder(id: string, actor?: ServiceOrderActor): Promise<void> {
  const { data: order, error } = await supabase
    .from('service_orders')
    .update({ status: 'annule' })
    .eq('id', id)
    .select('id, business_id, order_number, total')
    .single();
  if (error) throw new Error(error.message);

  if (order) {
    logAction({
      business_id: order.business_id,
      action:      'service_order.cancelled',
      entity_type: 'service_order',
      entity_id:   id,
      user_id:     actor?.userId,
      user_name:   actor?.userName,
      metadata:    { order_number: order.order_number, total: order.total },
    });
  }
}
