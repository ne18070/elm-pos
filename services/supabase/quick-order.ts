import { supabase } from './client';
import { q } from './q';
import type { Order } from '../../types';

/**
 * Lectures dédiées à l'écran « Commande rapide ». Aucune modification des
 * services de commande existants : on ne fait que lire les commandes passées
 * d'un revendeur pour la reprise de commande.
 */

const RESELLER_ORDERS_SELECT =
  '*, items:order_items(*), reseller:resellers!reseller_id(id,name,type), reseller_client:reseller_clients!reseller_client_id(id,name,phone)';

/** Dernières commandes d'un revendeur (hors annulées), les plus récentes d'abord. */
export async function getResellerOrders(
  businessId: string,
  resellerId: string,
  limit = 5,
): Promise<Order[]> {
  const rows = await q<Order[]>(
    supabase
      .from('orders')
      .select(RESELLER_ORDERS_SELECT)
      .eq('business_id', businessId)
      .eq('reseller_id', resellerId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(limit) as never,
  );
  return rows ?? [];
}
