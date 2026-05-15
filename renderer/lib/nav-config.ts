import {
  ShoppingCart, ClipboardList, Package, LayoutGrid, Warehouse, Store, BedDouble,
  Truck, UserCheck, MapPin, Scale, Receipt, BarChart2, TrendingDown, BookOpen,
  Users, Tag, MessageCircle, UsersRound, ScrollText, Settings, Wrench, FileSignature, Car, CalendarDays, Vault, History, PackageCheck,
  GraduationCap, DatabaseZap
} from 'lucide-react';
import type { PermissionKey } from './permissions';
import type { BusinessType } from '@pos-types';

export type NavItem    = { href: string; icon: any; label: string; permission: PermissionKey | null };
export type NavSection = { label: string; items: NavItem[] };

// ─── Sections partagées ────────────────────────────────────────────────────────

const S_VENTES: NavSection = {
  label: 'Ventes & Services',
  items: [
    { href: '/pos',     icon: ShoppingCart,  label: 'Caisse (POS)',         permission: 'view_pos'          },
    { href: '/caisse',  icon: Vault,         label: 'Gestion de caisse',    permission: 'view_cash_session' },
    { href: '/orders',  icon: ClipboardList, label: 'Commandes',            permission: 'view_orders'       },
    { href: '/services',icon: Wrench,        label: 'Prestations',          permission: 'view_services'     },
    { href: '/contrats',icon: FileSignature, label: 'Contrats & Location',  permission: 'view_contrats'     },
    { href: '/voitures',icon: Car,           label: 'Vente de Voitures',    permission: 'view_voitures'     },
  ],
};

const S_VENTES_SIMPLE: NavSection = {
  label: 'Ventes',
  items: [
    { href: '/pos',    icon: ShoppingCart,  label: 'Caisse (POS)', permission: 'view_pos'          },
    { href: '/caisse', icon: Vault,         label: 'Gestion de caisse', permission: 'view_cash_session' },
    { href: '/orders', icon: ClipboardList, label: 'Commandes',    permission: 'view_orders'       },
  ],
};

const S_RESTAURATION: NavSection = {
  label: 'Restauration',
  items: [
    { href: '/menu-du-jour',       icon: CalendarDays, label: 'Menu du jour',           permission: 'view_menu_du_jour'       },
    { href: '/commandes-emporter', icon: PackageCheck, label: 'À emporter & livraison', permission: 'view_commandes_emporter' },
  ],
};

const S_HEBERGEMENT: NavSection = {
  label: 'Hébergement',
  items: [
    { href: '/hotel', icon: BedDouble, label: 'Hôtel', permission: 'view_hotel' },
  ],
};

const S_LIVRAISON: NavSection = {
  label: 'Livraison & Terrain',
  items: [
    { href: '/livraison',     icon: Truck,    label: 'Suivi Livraisons', permission: 'view_livraisons'    },
    { href: '/livreurs',      icon: UserCheck, label: 'Gestion Livreurs', permission: 'view_livreurs'      },
    { href: '/team-tracking', icon: MapPin,   label: 'Tracking Terrain', permission: 'view_team_tracking' },
  ],
};

const S_STOCK: NavSection = {
  label: 'Catalogue & Stock',
  items: [
    { href: '/products',          icon: Package,    label: 'Produits',          permission: 'view_products'          },
    { href: '/categories',        icon: LayoutGrid, label: 'Catégories',        permission: 'view_categories'        },
    { href: '/approvisionnement', icon: Warehouse,  label: 'Approvisionnement', permission: 'view_approvisionnement' },
    { href: '/revendeurs',        icon: Store,      label: 'Revendeurs',        permission: 'view_revendeurs'        },
  ],
};

const S_JURIDIQUE: NavSection = {
  label: 'Espace Juridique',
  items: [
    { href: '/dossiers',   icon: Scale,   label: 'Gestion Dossiers',       permission: 'view_dossiers'   },
    { href: '/honoraires', icon: Receipt, label: 'Facturation Honoraires', permission: 'view_honoraires' },
  ],
};

const S_SCOLARITE: NavSection = {
  label: 'Scolarité',
  items: [
    { href: '/eleves',    icon: Users,        label: 'Base Élèves',      permission: 'view_eleves'    },
    { href: '/classes',   icon: LayoutGrid,   label: 'Gestion Classes',  permission: 'view_classes'   },
    { href: '/scolarite', icon: Receipt,      label: 'Suivi Scolarité',  permission: 'view_scolarite' },
    { href: '/bulletins', icon: GraduationCap,label: 'Notes & Bulletins',permission: 'view_notes'     },
  ],
};

const S_FINANCE: NavSection = {
  label: 'Finance & Comptabilité',
  items: [
    { href: '/analytics',    icon: BarChart2,    label: 'Tableau de bord', permission: 'view_analytics'    },
    { href: '/depenses',     icon: TrendingDown, label: 'Suivi Dépenses',  permission: 'view_depenses'     },
    { href: '/comptabilite', icon: BookOpen,     label: 'États Comptables',permission: 'view_comptabilite' },
  ],
};

const S_ADMIN: NavSection = {
  label: 'Administration',
  items: [
    { href: '/clients',   icon: Users,        label: 'Base Clients',           permission: 'view_clients'   },
    { href: '/coupons',   icon: Tag,          label: 'Coupons & Remises',      permission: 'view_coupons'   },
    { href: '/whatsapp',  icon: MessageCircle,label: 'WhatsApp Business',      permission: 'view_whatsapp'  },
    { href: '/staff',     icon: UsersRound,   label: 'Équipe & Paie',          permission: 'view_staff'     },
    { href: '/recovery',  icon: History,      label: 'Récupération Données',   permission: 'view_recovery'  },
    { href: '/import',    icon: DatabaseZap,  label: 'Import base de données', permission: 'view_import'    },
    { href: '/activity',  icon: ScrollText,   label: 'Journal Audit',          permission: 'view_activity'  },
    { href: '/settings',  icon: Settings,     label: 'Paramètres',             permission: 'view_settings'  },
  ],
};

// ─── Nav par type d'établissement ─────────────────────────────────────────────

export const NAV_BY_TYPE: Record<BusinessType, NavSection[]> = {
  retail:     [S_VENTES,        S_STOCK,    S_LIVRAISON, S_FINANCE, S_ADMIN],
  restaurant: [S_VENTES_SIMPLE, S_RESTAURATION, S_STOCK, S_LIVRAISON, S_FINANCE, S_ADMIN],
  hotel:      [S_VENTES_SIMPLE, S_HEBERGEMENT, S_RESTAURATION, S_STOCK, S_FINANCE, S_ADMIN],
  service:    [S_VENTES,        S_STOCK,    S_LIVRAISON, S_FINANCE, S_ADMIN],
  juridique:  [S_JURIDIQUE,     S_FINANCE,  S_ADMIN],
  education:  [S_SCOLARITE,     S_FINANCE,  S_ADMIN],
};

export function getNavSections(type: BusinessType | null | undefined): NavSection[] {
  if (!type) return [];
  return NAV_BY_TYPE[type] ?? [];
}

// Flat list de tous les items (pour la bottom nav mobile)
export const NAV_ITEMS: NavItem[] = Object.values(NAV_BY_TYPE)
  .flat()
  .flatMap(s => s.items)
  .filter((item, i, arr) => arr.findIndex(x => x.href === item.href) === i);

// ─── Bottom nav mobile (5 items max) ─────────────────────────────────────────

export const BOTTOM_NAV = [
  { href: '/pos',      icon: ShoppingCart,  label: 'Caisse'    },
  { href: '/orders',   icon: ClipboardList, label: 'Commandes' },
  { href: '/products', icon: Package,       label: 'Produits'  },
  { href: '/analytics',icon: BarChart2,     label: 'Stats'     },
] as const;
