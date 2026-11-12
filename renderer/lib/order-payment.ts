import type { Order } from '@pos-types';
import type { BadgeTone } from '@/components/ui/Badge';

/**
 * État de paiement d'une commande — UNE seule définition pour la liste des
 * commandes et le panneau de détail (elles divergeaient : la liste excluait les
 * commandes boutique des acomptes, le panneau seulement WhatsApp).
 *
 * Somme des lignes `payments` (et non `order.amount_paid`) : c'est ce que la
 * mise à jour optimiste de la liste modifie après un encaissement, sans attendre
 * le refetch. `amount_paid` (dénormalisé) ne sert qu'aux filtres SQL.
 */

/** Canaux où le client commande à distance et règle chez le marchand (livraison / retrait). */
const ONLINE_SOURCES = ['whatsapp', 'boutique'];

export function getPaidAmount(order: Order): number {
  return (order.payments ?? []).reduce((s, p) => s + p.amount, 0);
}

export function getRemainingAmount(order: Order): number {
  return Math.max(0, order.total - getPaidAmount(order));
}

export function isOnlineOrder(order: Order): boolean {
  return ONLINE_SOURCES.includes((order as { source?: string | null }).source ?? '');
}

function isOpen(order: Order): boolean {
  return order.status !== 'cancelled' && order.status !== 'refunded';
}

/**
 * Vente de caisse partiellement payée (acompte, vente à crédit) : le client est
 * reparti avec un reste à payer. Même critère que le filtre SQL `acompteOnly`
 * (balance_due > 0, hors canaux en ligne — migrations 112 et 158).
 */
export function isAcompte(order: Order): boolean {
  return isOpen(order) && !isOnlineOrder(order) && getRemainingAmount(order) > 0.01;
}

/** Commande en ligne pas encore (entièrement) réglée : à encaisser à la livraison ou au retrait. */
export function isOnlineToCollect(order: Order): boolean {
  return order.status === 'pending' && isOnlineOrder(order) && getRemainingAmount(order) > 0.01;
}

/** Libellé + ton du badge de statut, dans le vocabulaire du marchand. */
export function orderStatusBadge(order: Order): { label: string; tone: BadgeTone } {
  if (isAcompte(order))         return { label: 'Reste à payer', tone: 'warning' };
  if (isOnlineToCollect(order)) return { label: 'À encaisser',   tone: 'info' };
  switch (order.status) {
    case 'paid':      return { label: 'Payée',      tone: 'success' };
    case 'pending':   return { label: 'En attente', tone: 'warning' };
    case 'cancelled': return { label: 'Annulée',    tone: 'error' };
    case 'refunded':  return { label: 'Remboursée', tone: 'purple' };
    default:          return { label: String(order.status), tone: 'neutral' };
  }
}
