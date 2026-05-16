import type { Business } from '@pos-types';

export type BusinessKind = 'boutique' | 'restaurant' | 'location' | 'service' | 'juridique' | 'autre';

export function getBusinessKind(business: Business | null): BusinessKind {
  if (!business) return 'boutique';
  const types    = business.types    ?? [];
  const features = business.features ?? [];
  const sector   = business.industry_sector ?? '';
  const type     = business.type;

  if (type === 'juridique' || sector === 'juridique' || features.includes('dossiers') || features.includes('honoraires')) return 'juridique';
  if (sector === 'location' || features.includes('contrats'))                                                              return 'location';
  if (type === 'restaurant' || types.includes('restaurant') || features.includes('restaurant'))                           return 'restaurant';
  if (type === 'service'    || types.includes('service')    || features.includes('service'))                              return 'service';
  if (type === 'retail'     || types.includes('retail')     || features.includes('pos') || features.includes('caisse'))  return 'boutique';
  return 'autre';
}
