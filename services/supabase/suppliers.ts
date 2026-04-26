import { supabase as _supabase } from './client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

export interface Supplier {
  id:         string;
  business_id: string;
  name:       string;
  phone?:     string | null;
  address?:   string | null;
  notes?:     string | null;
  is_active:  boolean;
  created_at: string;
}

export async function getSuppliers(businessId: string): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('name');
  if (error) throw new Error(error.message);
  return data as Supplier[];
}

export async function upsertSupplier(
  businessId: string,
  input: { id?: string; name: string; phone?: string; address?: string; notes?: string }
): Promise<Supplier> {
  const payload: Record<string, unknown> = {
    business_id: businessId,
    name:        input.name.trim(),
    phone:       input.phone?.trim() || null,
    address:     input.address?.trim() || null,
    notes:       input.notes?.trim() || null,
    is_active:   true,
  };
  if (input.id) payload.id = input.id;

  const { data, error } = await supabase
    .from('suppliers')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Supplier;
}

export async function deleteSupplier(id: string): Promise<void> {
  const { error } = await supabase
    .from('suppliers')
    .update({ is_active: false })
    .eq('id', id);
  if (error) throw new Error(error.message);
}
