import { supabase as _supabase } from './client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PublicHotelInfo {
  id: string;
  name: string;
  logo_url: string | null;
  currency: string;
  phone: string | null;
  address: string | null;
}

export interface PublicRoom {
  id: string;
  number: string;
  type: 'simple' | 'double' | 'twin' | 'suite' | 'familiale';
  floor: string | null;
  capacity: number;
  price_per_night: number;
  description: string | null;
  amenities: string[];
}

export interface CreatePublicReservationInput {
  business_id:  string;
  room_id:      string;
  guest_name:   string;
  guest_phone:  string;
  guest_email?: string;
  check_in:     string;
  check_out:    string;
  num_guests:   number;
  notes?:       string;
}

export interface PublicReservationResult {
  id:                 string;
  confirmation_token: string;
  total:              number;
  nights:             number;
}

export interface PublicReservationDetail {
  id:               string;
  status:           string;
  check_in:         string;
  check_out:        string;
  num_guests:       number;
  price_per_night:  number;
  total_room:       number;
  total:            number;
  paid_amount:      number;
  notes:            string | null;
  created_at:       string;
  guest_name:       string;
  guest_phone:      string | null;
  guest_email:      string | null;
  room_number:      string;
  room_type:        string;
  room_floor:       string | null;
  room_capacity:    number;
  room_amenities:   string[];
  business_name:    string;
  business_phone:   string | null;
  logo_url:         string | null;
  currency:         string;
}

// ─── Fonctions publiques ──────────────────────────────────────────────────────

export async function getPublicHotelInfo(businessId: string): Promise<PublicHotelInfo | null> {
  const { data, error } = await supabase
    .from('businesses')
    .select('id, name, logo_url, currency, phone, address')
    .eq('id', businessId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function getAvailableRooms(
  businessId: string,
  checkIn:    string,
  checkOut:   string,
): Promise<PublicRoom[]> {
  const { data, error } = await supabase.rpc('get_available_rooms', {
    p_business_id: businessId,
    p_check_in:    checkIn,
    p_check_out:   checkOut,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as PublicRoom[];
}

export async function createPublicReservation(
  input: CreatePublicReservationInput,
): Promise<PublicReservationResult> {
  const { data, error } = await supabase.rpc('create_public_reservation', {
    p_data: {
      business_id:  input.business_id,
      room_id:      input.room_id,
      guest_name:   input.guest_name,
      guest_phone:  input.guest_phone,
      guest_email:  input.guest_email ?? '',
      check_in:     input.check_in,
      check_out:    input.check_out,
      num_guests:   input.num_guests,
      notes:        input.notes ?? '',
    },
  });
  if (error) throw new Error(error.message);
  return data as PublicReservationResult;
}

export async function getPublicReservation(
  token: string,
): Promise<PublicReservationDetail | null> {
  const { data, error } = await supabase.rpc('get_public_reservation', {
    p_token: token,
  });
  if (error || !data) return null;
  return data as PublicReservationDetail;
}
