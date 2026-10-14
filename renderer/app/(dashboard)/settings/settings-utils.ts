import { 
  ShoppingBag, Wrench, Briefcase, BedDouble, Car, Scale, FileText, Search 
} from 'lucide-react';
import { getPublicSiteUrl } from '@/lib/public-links';

export const DEFAULT_UNITS = ['pièce', 'kg', 'g', 'litre', 'cl', 'carton', 'sac', 'sachet', 'boîte', 'paquet', 'lot'];

export const ALL_PUBLIC_MODULES = [
  { key: 'boutique',    label: 'Boutique / Catalogue', icon: ShoppingBag, features: ['retail'],    bizTypes: null as string[] | null },
  { key: 'services',    label: 'Prestations de service', icon: Wrench,     features: ['voitures'],  bizTypes: ['service']  as string[] | null },
  { key: 'location',   label: 'Location',           icon: Briefcase,   features: ['contrats'],    bizTypes: null as string[] | null },
  { key: 'reservation',label: 'Réservation Hôtel',  icon: BedDouble,   features: ['hotel'],     bizTypes: null as string[] | null },
  { key: 'voitures',   label: 'Vente de Voitures',  icon: Car,         features: ['voitures'],  bizTypes: null as string[] | null },
  { key: 'juridique',  label: 'Juridique',          icon: Scale,       features: ['juridique'], bizTypes: ['juridique'] as string[] },
  { key: 'c',          label: 'Espace Client / Contrat', icon: FileText, features: ['contrats'], bizTypes: null as string[] | null },
  { key: 'track',      label: 'Suivi de Commande',  icon: Search,      features: ['orders'],    bizTypes: null as string[] | null },
];

/** URL publique des liens partagés et QR codes (https://www.elm-app.click) — jamais l'origine
 *  locale : depuis Electron elle vaut file:// ou localhost, et les liens doivent pouvoir
 *  ouvrir l'app mobile (Universal Links / App Links) ou le site. */
export function getAppUrl() {
  return getPublicSiteUrl();
}

export function qrImageUrl(url: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=512x512&margin=16&ecc=H&format=png&data=${encodeURIComponent(url)}`;
}

export function normalizeSlug(slug: string): string {
  return slug
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
