import { supabase as _supabase } from './client';

// Tables ajoutées par migration 036 — pas encore dans database.types.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

// ─── Types ────────────────────────────────────────────────────────────────────

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
  status: RoomStatus;
  description?: string | null;
  amenities: string[];
  is_active: boolean;
  created_at: string;
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

// ─── Utils ────────────────────────────────────────────────────────────────────

export function nightsBetween(from: string, to: string): number {
  const d1 = new Date(from);
  const d2 = new Date(to);
  return Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86_400_000));
}

// ─── Chambres ─────────────────────────────────────────────────────────────────

export async function getRooms(businessId: string): Promise<HotelRoom[]> {
  const { data, error } = await supabase
    .from('hotel_rooms')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('floor', { nullsFirst: true })
    .order('number');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createRoom(
  businessId: string,
  payload: Omit<HotelRoom, 'id' | 'business_id' | 'created_at'>
): Promise<HotelRoom> {
  const { data, error } = await supabase
    .from('hotel_rooms')
    .insert({ ...payload, business_id: businessId })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateRoom(
  id: string,
  payload: Partial<Omit<HotelRoom, 'id' | 'business_id' | 'created_at'>>
): Promise<HotelRoom> {
  const { data, error } = await supabase
    .from('hotel_rooms')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteRoom(id: string): Promise<void> {
  const { error } = await supabase.from('hotel_rooms').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Clients hôtel ────────────────────────────────────────────────────────────

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

// ─── Disponibilité ────────────────────────────────────────────────────────────

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
    p_exclude_id: excludeId ?? null,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as RoomConflict[];
}

// ─── Réservations ─────────────────────────────────────────────────────────────

export async function getReservations(businessId: string): Promise<HotelReservation[]> {
  const { data, error } = await supabase
    .from('hotel_reservations')
    .select('*, room:hotel_rooms(*), guest:hotel_guests(*)')
    .eq('business_id', businessId)
    .order('check_in', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
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
  }
): Promise<HotelReservation> {
  const nights    = nightsBetween(payload.check_in, payload.check_out);
  const total_room = nights * payload.price_per_night;
  const { data, error } = await supabase
    .from('hotel_reservations')
    .insert({
      ...payload,
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
  return data;
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
  return data;
}

export async function checkOut(
  reservationId: string,
  roomId: string,
  paidAmount: number
): Promise<HotelReservation> {
  const now = new Date().toISOString();

  // Recalculate services total
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
    .select('total_room')
    .eq('id', reservationId)
    .single();
  const total = Number(current?.total_room ?? 0) + total_services;

  const { data, error } = await supabase
    .from('hotel_reservations')
    .update({
      status: 'checked_out',
      actual_check_out: now,
      total_services,
      total,
      paid_amount: paidAmount,
      updated_at: now,
    })
    .eq('id', reservationId)
    .select('*, room:hotel_rooms(*), guest:hotel_guests(*)')
    .single();
  if (error) throw new Error(error.message);
  await supabase.from('hotel_rooms').update({ status: 'cleaning' }).eq('id', roomId);
  return data;
}

export async function cancelReservation(reservationId: string): Promise<HotelReservation> {
  const { data, error } = await supabase
    .from('hotel_reservations')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', reservationId)
    .select('*, room:hotel_rooms(*), guest:hotel_guests(*)')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ─── Prestations ──────────────────────────────────────────────────────────────

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
