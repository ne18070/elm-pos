import { supabase as _supabase } from './client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

export interface VehicleOwnerReportItem {
  client_name?: string | null;
  start_date?: string | null;
  start_time?: string | null;
  end_date?: string | null;
  end_time?: string | null;
  status?: string | null;
  total_amount?: number | null;
  amount_paid?: number | null;
  price?: number | null;
  updated_at?: string | null;
  date?: string | null;
  label?: string | null;
  amount?: number | null;
}

export interface VehicleOwnerReport {
  kind: 'rental' | 'sale';
  business_name: string;
  business_phone: string | null;
  currency: string;
  vehicle: {
    name: string;
    brand: string | null;
    model: string | null;
    year: number | null;
    plate: string | null;
    image: string | null;
    owner_name: string | null;
    owner_phone: string | null;
    commission_type: 'percent' | 'fixed';
    commission_value: number;
  };
  totals: {
    gross: number;
    commission: number;
    owner_share: number;
  };
  rentals: VehicleOwnerReportItem[];
  sales: VehicleOwnerReportItem[];
  expenses: VehicleOwnerReportItem[];
}

export async function getVehicleOwnerReport(token: string): Promise<VehicleOwnerReport | null> {
  const { data, error } = await supabase.rpc('get_vehicle_owner_report', { p_token: token });
  if (error) throw new Error(error.message);
  return data ?? null;
}
