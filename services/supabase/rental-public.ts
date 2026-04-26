import { supabase as _supabase } from './client';
import { findPublicBusinessByRef } from './public-business-ref';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PublicAgencyInfo {
  id:       string;
  name:     string;
  logo_url: string | null;
  currency: string;
  phone:    string | null;
  address:  string | null;
}

export interface PublicVehicle {
  id:             string;
  name:           string;
  brand:          string | null;
  model:          string | null;
  year:           number | null;
  license_plate:  string | null;
  color:          string | null;
  price_per_day:  number;
  price_per_hour: number | null;
  deposit_amount: number;
  currency:       string;
  description:    string | null;
  image_url:      string | null;
  is_available:   boolean;
}

export interface CreatePublicRentalInput {
  business_id:      string;
  vehicle_id:       string;
  client_name:      string;
  client_phone:     string;
  client_email?:    string;
  client_id_number?: string;
  client_address?:  string;
  start_date:       string;
  start_time?:      string;
  end_date:         string;
  end_time?:        string;
  pickup_location?: string;
  return_location?: string;
  notes?:           string;
}

export interface PublicRentalResult {
  id:    string;
  token: string;
  total: number;
  days:  number;
}

export interface PublicRentalDetail {
  id:              string;
  status:          string;
  start_date:      string;
  start_time:      string | null;
  end_date:        string;
  end_time:        string | null;
  client_name:     string;
  client_phone:    string | null;
  client_email:    string | null;
  price_per_day:   number;
  deposit_amount:  number;
  total_amount:    number;
  pickup_location: string | null;
  return_location: string | null;
  notes:           string | null;
  created_at:      string;
  currency:        string;
  vehicle_name:    string;
  vehicle_brand:   string | null;
  vehicle_model:   string | null;
  vehicle_year:    number | null;
  vehicle_plate:   string | null;
  vehicle_color:   string | null;
  vehicle_image:   string | null;
  business_name:   string;
  business_phone:  string | null;
  logo_url:        string | null;
}

// ─── Fonctions publiques ──────────────────────────────────────────────────────

export async function getPublicAgencyInfo(businessId: string): Promise<PublicAgencyInfo | null> {
  return findPublicBusinessByRef<PublicAgencyInfo>(
    businessId,
    'id, name, logo_url, currency, phone, address',
  );
}

export async function getAvailableVehicles(
  businessId: string,
  startDate:  string,
  endDate:    string,
  startTime = '09:00',
  endTime = '18:00',
): Promise<PublicVehicle[]> {
  const { data, error } = await supabase.rpc('get_available_vehicles', {
    p_business_id: businessId,
    p_start_date:  startDate,
    p_end_date:    endDate,
    p_start_time:  startTime,
    p_end_time:    endTime,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as PublicVehicle[];
}

export async function createPublicRentalRequest(
  input: CreatePublicRentalInput,
): Promise<PublicRentalResult> {
  const { data, error } = await supabase.rpc('create_public_rental_request', {
    p_data: {
      business_id:      input.business_id,
      vehicle_id:       input.vehicle_id,
      client_name:      input.client_name,
      client_phone:     input.client_phone,
      client_email:     input.client_email    ?? '',
      client_id_number: input.client_id_number ?? '',
      client_address:   input.client_address  ?? '',
      start_date:       input.start_date,
      start_time:       input.start_time ?? '',
      end_date:         input.end_date,
      end_time:         input.end_time ?? '',
      pickup_location:  input.pickup_location ?? '',
      return_location:  input.return_location ?? '',
      notes:            input.notes           ?? '',
    },
  });
  if (error) throw new Error(error.message);
  return data as PublicRentalResult;
}

export async function getPublicRentalRequest(
  token: string,
): Promise<PublicRentalDetail | null> {
  const { data, error } = await supabase.rpc('get_public_rental_request', {
    p_token: token,
  });
  if (error || !data) return null;
  return data as PublicRentalDetail;
}
