import { supabase } from './client';
import type { RestaurantFloor, RestaurantTable, TableStatus } from '../../types';

// tables added via migration 077 - not in database.types.ts yet

// ─── Floors ───────────────────────────────────────────────────────────────────

export async function getFloors(businessId: string): Promise<RestaurantFloor[]> {
  const { data, error } = await supabase
    .from('restaurant_floors')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('position', { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []) as unknown as RestaurantFloor[];
}

export async function createFloor(floor: Partial<RestaurantFloor>): Promise<RestaurantFloor> {
  const { data, error } = await supabase
    .from('restaurant_floors')
    .insert(floor as unknown as import('./database.types').TablesInsert<'restaurant_floors'>)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as RestaurantFloor;
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
  return (data || []) as unknown as RestaurantTable[];
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
    .insert(table as unknown as import('./database.types').TablesInsert<'restaurant_tables'>)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as RestaurantTable;
}

export async function updateFloor(floorId: string, data: Partial<RestaurantFloor>): Promise<void> {
  const { error } = await supabase
    .from('restaurant_floors')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', floorId);
  if (error) throw new Error(error.message);
}

export async function deleteFloor(floorId: string): Promise<void> {
  const { error } = await supabase
    .from('restaurant_floors')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', floorId);
  if (error) throw new Error(error.message);
}

export async function updateTable(tableId: string, data: Partial<RestaurantTable>): Promise<void> {
  const { error } = await supabase
    .from('restaurant_tables')
    .update({ ...data, updated_at: new Date().toISOString() } as unknown as import('./database.types').TablesUpdate<'restaurant_tables'>)
    .eq('id', tableId);
  if (error) throw new Error(error.message);
}

export async function deleteTable(tableId: string): Promise<void> {
  const { error } = await supabase
    .from('restaurant_tables')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', tableId);
  if (error) throw new Error(error.message);
}
