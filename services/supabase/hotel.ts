import { supabase } from './client';

// --- Types --------------------------------------------------------------------

export type RoomType   = 'simple' | 'double' | 'twin' | 'suite' | 'familiale';
export type RoomStatus = 'available' | 'occupied' | 'cleaning' | 'maintenance';
export type ReservationStatus = 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show';

export interface HotelRoom {
  id: string;
  business_id: string;
  number: string;
  type: RoomType;
  floor?: string | null;
  capacity: number;
  price_per_night: number;
  weekend_price_per_night?: number | null; // migration 054
  assigned_cleaner_id?: string | null;     // migration 055
  status: RoomStatus;
  description?: string | null;
  amenities: string[];
  is_active: boolean;
  created_at: string;
}

export interface HotelCleaningLog {
  id: string;
  business_id: string;
  room_id: string;
  reservation_id?: string | null;
  cleaner_id?: string | null;
  action: 'cleaned' | 'maintenance_start' | 'maintenance_end' | 'assigned';
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  cleaner?: { id: string; name: string } | null;
}

export interface HotelGuest {
  id: string;
  business_id: string;
  full_name: string;
  phone?: string | null;
  email?: string | null;
  id_type?: string | null;
  id_number?: string | null;
  nationality?: string | null;
  address?: string | null;
  notes?: string | null;
  preferences?: string | null;    // migration 056
  date_of_birth?: string | null;  // migration 056
  created_at: string;
}

export interface HotelReservation {
  id: string;
  business_id: string;
  room_id: string;
  guest_id: string;
  check_in: string;
  check_out: string;
  num_guests: number;
  price_per_night: number;
  total_room: number;
  total_services: number;
  total: number;
  paid_amount: number;
  status: ReservationStatus;
  actual_check_in?: string | null;
  actual_check_out?: string | null;
  notes?: string | null;
  source?: string | null;            // migration 014
  confirmation_token?: string | null; // migration 014
  group_id?: string | null;          // migration 054
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  // jointures
  room?: HotelRoom;
  guest?: HotelGuest;
}

export interface HotelService {
  id: string;
  business_id: string;
  reservation_id: string;
  label: string;
  amount: number;
  service_date: string;
  created_at: string;
}

// --- Utils --------------------------------------------------------------------

export function nightsBetween(from: string, to: string): number {
  const d1 = new Date(from);
  const d2 = new Date(to);
  return Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86_400_000));
}

/**
 * Calcule le total hébergement en tenant compte du tarif weekend.
 * Vendredi (5) et samedi (6) = weekend_price si défini.
 */
export function computeRoomTotal(
  checkIn: string,
  checkOut: string,
  basePrice: number,
  weekendPrice?: number | null,
): { total: number; nights: number; hasWeekendRates: boolean } {
  const start = new Date(checkIn + 'T12:00:00');
  const end   = new Date(checkOut + 'T12:00:00');
  let total = 0;
  let nights = 0;
  let hasWeekendRates = false;
  const cur = new Date(start);
  while (cur < end) {
    const day = cur.getDay(); // 0=dim, 5=ven, 6=sam
    const isWeekend = day === 5 || day === 6;
    if (isWeekend && weekendPrice) {
      total += weekendPrice;
      hasWeekendRates = true;
    } else {
      total += basePrice;
    }
    cur.setDate(cur.getDate() + 1);
    nights++;
  }
  return { total, nights: Math.max(1, nights), hasWeekendRates };
}

// --- Chambres -----------------------------------------------------------------

export async function getRooms(businessId: string): Promise<HotelRoom[]> {
  const { data, error } = await supabase
    .from('hotel_rooms')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('floor', { nullsFirst: true })
    .order('number');
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as HotelRoom[];
}

export async function createRoom(
  businessId: string,
  payload: Omit<HotelRoom, 'id' | 'business_id' | 'created_at'>
): Promise<HotelRoom> {
  const { data, error } = await supabase
    .from('hotel_rooms')
    .insert({ ...payload, business_id: businessId } as unknown as import('./database.types').TablesInsert<'hotel_rooms'>)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as HotelRoom;
}

export async function updateRoom(
  id: string,
  payload: Partial<Omit<HotelRoom, 'id' | 'business_id' | 'created_at'>>
): Promise<HotelRoom> {
  const { data, error } = await supabase
    .from('hotel_rooms')
    .update(payload as unknown as import('./database.types').TablesUpdate<'hotel_rooms'>)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as HotelRoom;
}

// Soft-delete : on conserve l'historique des réservations liées
export async function deleteRoom(id: string): Promise<void> {
  const { error } = await supabase
    .from('hotel_rooms')
    .update({ is_active: false })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// --- Clients hôtel ------------------------------------------------------------

export async function getGuests(businessId: string): Promise<HotelGuest[]> {
  const { data, error } = await supabase
    .from('hotel_guests')
    .select('*')
    .eq('business_id', businessId)
    .order('full_name');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createGuest(
  businessId: string,
  payload: Omit<HotelGuest, 'id' | 'business_id' | 'created_at'>
): Promise<HotelGuest> {
  const { data, error } = await supabase
    .from('hotel_guests')
    .insert({ ...payload, business_id: businessId })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateGuest(
  id: string,
  payload: Partial<Omit<HotelGuest, 'id' | 'business_id' | 'created_at'>>
): Promise<HotelGuest> {
  const { data, error } = await supabase
    .from('hotel_guests')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteGuest(id: string): Promise<void> {
  const { error } = await supabase.from('hotel_guests').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// --- Disponibilité ------------------------------------------------------------

export interface RoomConflict {
  id: string;
  check_in: string;
  check_out: string;
  status: ReservationStatus;
  guest_name: string | null;
}

/**
 * Retourne les réservations actives qui chevauchent la période demandée.
 * Résultat vide = chambre disponible.
 */
export async function getRoomConflicts(
  roomId: string,
  checkIn: string,
  checkOut: string,
  excludeId?: string
): Promise<RoomConflict[]> {
  const { data, error } = await supabase.rpc('get_room_conflicts', {
    p_room_id:    roomId,
    p_check_in:   checkIn,
    p_check_out:  checkOut,
    p_exclude_id: excludeId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as RoomConflict[];
}

// --- Réservations -------------------------------------------------------------

const PAGE_SIZE = 100;

export async function getReservations(
  businessId: string,
  opts?: { limit?: number; offset?: number }
): Promise<{ data: HotelReservation[]; hasMore: boolean }> {
  const limit  = opts?.limit  ?? PAGE_SIZE;
  const offset = opts?.offset ?? 0;
  const { data, error } = await supabase
    .from('hotel_reservations')
    .select('*, room:hotel_rooms(*), guest:hotel_guests(*)')
    .eq('business_id', businessId)
    .order('check_in', { ascending: false })
    .range(offset, offset + limit); // fetch limit+1 pour détecter s'il y en a plus
  if (error) throw new Error(error.message);
  // Supabase TS inference doesn't resolve aliased joins — cast at return point
  const rows = (data ?? []) as unknown as HotelReservation[];
  return { data: rows.slice(0, limit), hasMore: rows.length > limit };
}

export async function createReservation(
  businessId: string,
  userId: string,
  payload: {
    room_id: string;
    guest_id: string;
    check_in: string;
    check_out: string;
    num_guests: number;
    price_per_night: number;
    notes?: string;
    group_id?: string | null;
    weekendPrice?: number | null;
  }
): Promise<HotelReservation> {
  const { weekendPrice, ...rest } = payload;
  const { total: total_room } = computeRoomTotal(
    payload.check_in,
    payload.check_out,
    payload.price_per_night,
    weekendPrice,
  );
  const { data, error } = await supabase
    .from('hotel_reservations')
    .insert({
      ...rest,
      business_id:    businessId,
      total_room,
      total_services: 0,
      total:          total_room,
      paid_amount:    0,
      status:         'confirmed',
      created_by:     userId,
    })
    .select('*, room:hotel_rooms(*), guest:hotel_guests(*)')
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as HotelReservation;
}

export async function updateReservation(
  reservationId: string,
  payload: {
    room_id: string;
    check_in: string;
    check_out: string;
    num_guests: number;
    price_per_night: number;
    notes?: string | null;
    weekendPrice?: number | null;
  }
): Promise<HotelReservation> {
  const { weekendPrice, ...rest } = payload;
  const { total: total_room } = computeRoomTotal(
    payload.check_in,
    payload.check_out,
    payload.price_per_night,
    weekendPrice,
  );

  const { data: svcs } = await supabase
    .from('hotel_services')
    .select('amount')
    .eq('reservation_id', reservationId);
  const total_services = (svcs ?? []).reduce(
    (s: number, x: { amount: number }) => s + Number(x.amount), 0
  );

  const { data, error } = await supabase
    .from('hotel_reservations')
    .update({
      ...rest,
      total_room,
      total_services,
      total: total_room + total_services,
      updated_at: new Date().toISOString(),
    })
    .eq('id', reservationId)
    .select('*, room:hotel_rooms(*), guest:hotel_guests(*)')
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as HotelReservation;
}

export async function checkIn(reservationId: string, roomId: string): Promise<HotelReservation> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('hotel_reservations')
    .update({ status: 'checked_in', actual_check_in: now, updated_at: now })
    .eq('id', reservationId)
    .select('*, room:hotel_rooms(*), guest:hotel_guests(*)')
    .single();
  if (error) throw new Error(error.message);
  await supabase.from('hotel_rooms').update({ status: 'occupied' }).eq('id', roomId);
  return data as unknown as HotelReservation;
}

export async function checkOut(
  reservationId: string,
  roomId: string,
  additionalPayment: number,
  sessionId: string | null = null,
  method: 'cash' | 'card' | 'mobile_money' = 'cash',
): Promise<HotelReservation> {
  const now = new Date().toISOString();

  const { data: svcs } = await supabase
    .from('hotel_services')
    .select('amount')
    .eq('reservation_id', reservationId);
  const total_services = (svcs ?? []).reduce(
    (sum: number, s: { amount: number }) => sum + Number(s.amount),
    0
  );

  const { data: current } = await supabase
    .from('hotel_reservations')
    .select('total_room, paid_amount, business_id')
    .eq('id', reservationId)
    .single();
  const total       = Number(current?.total_room ?? 0) + total_services;
  const existingPaid = Number(current?.paid_amount ?? 0);
  const newPaid      = existingPaid + additionalPayment;

  const { data, error } = await supabase
    .from('hotel_reservations')
    .update({
      status: 'checked_out',
      actual_check_out: now,
      total_services,
      total,
      paid_amount: newPaid,
      updated_at: now,
    })
    .eq('id', reservationId)
    .select('*, room:hotel_rooms(*), guest:hotel_guests(*)')
    .single();
  if (error) throw new Error(error.message);
  await supabase.from('hotel_rooms').update({ status: 'cleaning' }).eq('id', roomId);

  if (additionalPayment > 0 && current?.business_id) {
    await addHotelPayment(
      current.business_id,
      reservationId,
      additionalPayment,
      method,
      sessionId,
    );
  }
  return data as unknown as HotelReservation;
}

export async function cancelReservation(reservationId: string): Promise<HotelReservation> {
  const { data, error } = await supabase
    .from('hotel_reservations')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', reservationId)
    .select('*, room:hotel_rooms(*), guest:hotel_guests(*)')
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as HotelReservation;
}

export async function markNoShow(reservationId: string): Promise<HotelReservation> {
  const { data, error } = await supabase
    .from('hotel_reservations')
    .update({ status: 'no_show', updated_at: new Date().toISOString() })
    .eq('id', reservationId)
    .select('*, room:hotel_rooms(*), guest:hotel_guests(*)')
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as HotelReservation;
}

// --- Prestations --------------------------------------------------------------

export async function getServices(reservationId: string): Promise<HotelService[]> {
  const { data, error } = await supabase
    .from('hotel_services')
    .select('*')
    .eq('reservation_id', reservationId)
    .order('service_date')
    .order('created_at');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function addService(
  businessId: string,
  reservationId: string,
  payload: { label: string; amount: number; service_date: string }
): Promise<HotelService> {
  const { data, error } = await supabase
    .from('hotel_services')
    .insert({ ...payload, business_id: businessId, reservation_id: reservationId })
    .select()
    .single();
  if (error) throw new Error(error.message);
  await _recalcServiceTotal(reservationId);
  return data;
}

export async function deleteService(id: string, reservationId: string): Promise<void> {
  const { error } = await supabase.from('hotel_services').delete().eq('id', id);
  if (error) throw new Error(error.message);
  await _recalcServiceTotal(reservationId);
}

// --- Paiements hôtel ----------------------------------------------------------

export async function addHotelPayment(
  businessId: string,
  reservationId: string,
  amount: number,
  method: 'cash' | 'card' | 'mobile_money',
  sessionId: string | null,
): Promise<void> {
  const { error: pe } = await supabase
    .from('hotel_payments')
    .insert({ business_id: businessId, reservation_id: reservationId, session_id: sessionId, amount, method });
  if (pe) throw new Error(pe.message);

  const { data: res } = await supabase
    .from('hotel_reservations')
    .select('paid_amount')
    .eq('id', reservationId)
    .single();
  const newPaid = Number(res?.paid_amount ?? 0) + amount;
  await supabase
    .from('hotel_reservations')
    .update({ paid_amount: newPaid, updated_at: new Date().toISOString() })
    .eq('id', reservationId);
}

export async function getRevenueToday(businessId: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from('hotel_payments')
    .select('amount')
    .eq('business_id', businessId)
    .gte('created_at', today + 'T00:00:00.000Z')
    .lte('created_at', today + 'T23:59:59.999Z');
  return (data ?? []).reduce((s: number, p: { amount: number }) => s + Number(p.amount), 0);
}

// --- Config réservation publique ----------------------------------------------

export async function updateHotelBookingConfig(
  businessId: string,
  payload: { hotel_cancellation_policy?: string | null; hotel_deposit_info?: string | null }
): Promise<void> {
  const { error } = await supabase
    .from('businesses')
    .update(payload)
    .eq('id', businessId);
  if (error) throw new Error(error.message);
}

// --- Ménage / Housekeeping ----------------------------------------------------

export async function getCleaningLogs(roomId: string, limit = 30): Promise<HotelCleaningLog[]> {
  const { data, error } = await supabase
    .from('hotel_cleaning_logs')
    .select('*, cleaner:staff(id, name)')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as HotelCleaningLog[];
}

export async function addCleaningLog(
  businessId: string,
  roomId: string,
  action: HotelCleaningLog['action'],
  opts?: { notes?: string; cleanerId?: string | null; reservationId?: string; userId?: string }
): Promise<HotelCleaningLog> {
  const { data, error } = await supabase
    .from('hotel_cleaning_logs')
    .insert({
      business_id: businessId,
      room_id: roomId,
      action,
      notes: opts?.notes || null,
      cleaner_id: opts?.cleanerId ?? null,
      reservation_id: opts?.reservationId ?? null,
      created_by: opts?.userId ?? null,
    })
    .select('*, cleaner:staff(id, name)')
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as HotelCleaningLog;
}

export async function markRoomClean(
  roomId: string,
  businessId: string,
  opts?: { notes?: string; userId?: string }
): Promise<HotelRoom> {
  const { data, error } = await supabase
    .from('hotel_rooms')
    .update({ status: 'available' })
    .eq('id', roomId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  await addCleaningLog(businessId, roomId, 'cleaned', opts);
  return data as unknown as HotelRoom;
}

export async function sendRoomToMaintenance(
  roomId: string,
  businessId: string,
  opts?: { notes?: string; userId?: string }
): Promise<HotelRoom> {
  const { data, error } = await supabase
    .from('hotel_rooms')
    .update({ status: 'maintenance' })
    .eq('id', roomId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  await addCleaningLog(businessId, roomId, 'maintenance_start', opts);
  return data as unknown as HotelRoom;
}

export async function markMaintenanceDone(
  roomId: string,
  businessId: string,
  opts?: { notes?: string; userId?: string }
): Promise<HotelRoom> {
  const { data, error } = await supabase
    .from('hotel_rooms')
    .update({ status: 'available' })
    .eq('id', roomId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  await addCleaningLog(businessId, roomId, 'maintenance_end', opts);
  return data as unknown as HotelRoom;
}

export async function assignRoomCleaner(
  roomId: string,
  cleanerId: string | null,
  businessId: string,
  opts?: { userId?: string }
): Promise<HotelRoom> {
  const { data, error } = await supabase
    .from('hotel_rooms')
    .update({ assigned_cleaner_id: cleanerId })
    .eq('id', roomId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  if (cleanerId) {
    await addCleaningLog(businessId, roomId, 'assigned', { cleanerId, userId: opts?.userId });
  }
  return data as unknown as HotelRoom;
}

async function _recalcServiceTotal(reservationId: string): Promise<void> {
  const { data: svcs } = await supabase
    .from('hotel_services')
    .select('amount')
    .eq('reservation_id', reservationId);
  const total_services = (svcs ?? []).reduce(
    (sum: number, s: { amount: number }) => sum + Number(s.amount),
    0
  );
  const { data: res } = await supabase
    .from('hotel_reservations')
    .select('total_room')
    .eq('id', reservationId)
    .single();
  const total = Number(res?.total_room ?? 0) + total_services;
  await supabase
    .from('hotel_reservations')
    .update({ total_services, total, updated_at: new Date().toISOString() })
    .eq('id', reservationId);
}
