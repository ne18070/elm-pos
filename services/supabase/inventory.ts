import { supabase } from './client';
import { q } from './q';
import { logAction } from './logger';

// Inventaire physique (comptage). Les écritures passent toutes par des RPC
// (migration 155) : la table n'est qu'en lecture pour « authenticated ».

export type InventoryStatus = 'open' | 'validated' | 'cancelled';

export interface InventorySession {
  id: string;
  business_id: string;
  name: string;
  status: InventoryStatus;
  category_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  validated_by: string | null;
  validated_at: string | null;
  // agrégats calculés côté client
  lines_count?: number;
}

export interface InventoryCountLine {
  id: string;
  session_id: string;
  business_id: string;
  product_id: string;
  /** Stock théorique figé au premier comptage de la ligne. */
  expected_qty: number;
  counted_qty: number;
  reason: string | null;
  counted_by: string | null;
  counted_at: string;
  /** Écart réellement appliqué au stock (renseigné à la validation). */
  applied_delta: number | null;
  unit_cost: number | null;
  unit_price: number | null;
}

/** Motifs d'écart proposés (texte libre accepté côté serveur). */
export const INVENTORY_REASONS = [
  'Casse',
  'Vol / perte',
  'Péremption',
  'Erreur de saisie',
  'Consommation interne',
  'Réception non saisie',
] as const;

export async function getInventorySessions(businessId: string): Promise<InventorySession[]> {
  const { data, error } = await supabase
    .from('inventory_sessions')
    .select('*, lines:inventory_count_lines(count)')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const { lines, ...rest } = row as unknown as InventorySession & { lines?: { count: number }[] };
    return { ...rest, lines_count: lines?.[0]?.count ?? 0 };
  });
}

export async function getInventorySession(id: string): Promise<InventorySession | null> {
  const data = await q<unknown>(
    supabase.from('inventory_sessions').select('*').eq('id', id).maybeSingle(),
  );
  return (data ?? null) as InventorySession | null;
}

export async function getInventoryLines(sessionId: string): Promise<InventoryCountLine[]> {
  const data = await q<unknown[]>(
    supabase
      .from('inventory_count_lines')
      .select('*')
      .eq('session_id', sessionId)
      .order('counted_at', { ascending: false }),
  );
  return (data ?? []) as unknown as InventoryCountLine[];
}

export async function createInventorySession(input: {
  businessId: string;
  name?: string;
  categoryId?: string | null;
  notes?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_inventory_session', {
    p_business_id: input.businessId,
    p_name:        input.name ?? '',
    p_category_id: input.categoryId ?? undefined,
    p_notes:       input.notes || undefined,
  });
  if (error) throw new Error(error.message);
  const id = data as string;
  logAction({
    business_id: input.businessId,
    action:      'inventory.created',
    entity_type: 'inventory_session',
    entity_id:   id,
    metadata:    { name: input.name, category_id: input.categoryId ?? null },
  });
  return id;
}

/**
 * Enregistre la quantité comptée d'un produit (valeur absolue pour la ligne).
 * `countedQty = null` efface la ligne (produit redevenu « non compté »).
 */
export async function setInventoryCount(
  sessionId: string,
  productId: string,
  countedQty: number | null,
  reason?: string | null,
): Promise<InventoryCountLine | null> {
  const { data, error } = await supabase.rpc('set_inventory_count', {
    p_session_id:  sessionId,
    p_product_id:  productId,
    p_counted_qty: countedQty,
    p_reason:      reason || undefined,
  });
  if (error) throw new Error(error.message);
  const line = data as unknown as InventoryCountLine | null;
  return countedQty === null || !line?.id ? null : line;
}

export async function validateInventorySession(
  businessId: string,
  sessionId: string,
): Promise<{ counted: number; adjusted: number }> {
  const { data, error } = await supabase.rpc('validate_inventory_session', { p_session_id: sessionId });
  if (error) throw new Error(error.message);
  const res = data as unknown as { counted: number; adjusted: number };
  logAction({
    business_id: businessId,
    action:      'inventory.validated',
    entity_type: 'inventory_session',
    entity_id:   sessionId,
    metadata:    res,
  });
  return res;
}

export async function cancelInventorySession(businessId: string, sessionId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_inventory_session', { p_session_id: sessionId });
  if (error) throw new Error(error.message);
  logAction({
    business_id: businessId,
    action:      'inventory.cancelled',
    entity_type: 'inventory_session',
    entity_id:   sessionId,
  });
}
