import { hasFeature } from '@/lib/permissions';
import type { Business } from '@pos-types';

export interface BusinessProfile {
  isHotel:     boolean;
  isJuridique: boolean;
  isRH:        boolean;
  /** Vend via commandes / caisse / prestations (commerce, resto, atelier…). */
  isStandard:  boolean;
}

/**
 * Quels blocs de stats concernent cet établissement. Passe par hasFeature() —
 * qui gère `types[]` et l'héritage des modules — et non `features.includes()`,
 * qui ratait les établissements multi-activités. Partagé par le chargement des
 * données et les cartes KPI pour qu'ils ne divergent jamais.
 */
export function getBusinessProfile(business: Business | null | undefined): BusinessProfile {
  const is = (f: string) => business?.type === f || hasFeature(business, f);
  return {
    isHotel:     is('hotel'),
    isJuridique: is('juridique') || hasFeature(business, 'dossiers') || hasFeature(business, 'honoraires'),
    isRH:        is('rh'),
    isStandard:  is('retail') || is('restaurant') || is('service'),
  };
}
