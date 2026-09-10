import type { ResellerType } from '@services/supabase/resellers';

/**
 * Présentation partagée des types de revendeur (rail « Commande rapide »,
 * résumé de commande, page Revendeurs…). Une seule source pour le libellé
 * et le badge afin d'éviter les copies divergentes.
 */
export const RESELLER_TYPE_LABELS: Record<ResellerType, string> = {
  gros: 'Gros',
  demi_gros: 'Demi-gros',
  detaillant: 'Détaillant',
};

/** Classe badge (fond + texte + bordure) par type — tokens de thème uniquement. */
export const RESELLER_TYPE_BADGE: Record<ResellerType, string> = {
  gros:       'bg-badge-purple text-status-purple border-status-purple/30',
  demi_gros:  'bg-badge-info text-status-info border-status-info/30',
  detaillant: 'bg-badge-success text-status-success border-status-success/30',
};
