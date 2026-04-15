import { supabase as _supabase } from './client';
import type { RestaurantFloor, RestaurantTable, TableStatus } from '../../types';

// tables added via migration 077 - not in database.types.ts yet
const supabase = _supabase as any;

// ─── Floors ───────────────────────────────────────────────────────────────────

export async function getFloors(businessId: string): Promise<RestaurantFloor[]> {
  const { data, error } = await supabase
    .from('restaurant_floors')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('position', { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function createFloor(floor: Partial<RestaurantFloor>): Promise<RestaurantFloor> {
  const { data, error } = await supabase
    .from('restaurant_floors')
    .insert(floor)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ─── Tables ───────────────────────────────────────────────────────────────────

export async function getTables(businessId: string, floorId?: string): Promise<RestaurantTable[]> {
  let query = supabase
    .from('restaurant_tables')
    .select('*, floor:restaurant_floors(name)')
    .eq('business_id', businessId)
    .eq('is_active', true);

  if (floorId) {
    query = query.eq('floor_id', floorId);
  }

  const { data, error } = await query.order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function updateTableStatus(tableId: string, status: TableStatus, orderId?: string | null): Promise<void> {
  const { error } = await supabase
    .from('restaurant_tables')
    .update({ 
      status, 
      current_order_id: orderId,
      updated_at: new Date().toISOString() 
    })
    .eq('id', tableId);

  if (error) throw new Error(error.message);
}

export async function updateTablePosition(
  tableId: string, 
  pos: { pos_x: number; pos_y: number; rotation?: number }
): Promise<void> {
  const { error } = await supabase
    .from('restaurant_tables')
    .update({ 
      ...pos,
      updated_at: new Date().toISOString() 
    })
    .eq('id', tableId);

  if (error) throw new Error(error.message);
}

export async function createTable(table: Partial<RestaurantTable>): Promise<RestaurantTable> {
  const { data, error } = await supabase
    .from('restaurant_tables')
    .insert(table)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}
