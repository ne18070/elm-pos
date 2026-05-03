import {
  ShoppingCart, ClipboardList, Package, LayoutGrid, Warehouse, Store, BedDouble,
  Truck, UserCheck, MapPin, Scale, Receipt, BarChart2, TrendingDown, BookOpen,
  Users, Tag, MessageCircle, UsersRound, ScrollText, Settings, Wrench, FileSignature, Car, CalendarDays, Vault, History
} from 'lucide-react';
import type { PermissionKey } from './permissions';

export const NAV_SECTIONS: { 
  label: string; 
  items: { href: string; icon: any; label: string; permission: PermissionKey | null }[] 
}[] = [
  {
    label: 'Ventes & Services',
    items: [
      { href: '/pos',               icon: ShoppingCart,  label: 'Caisse (POS)',       permission: 'view_pos'               },
      { href: '/caisse',            icon: Vault,         label: 'Gestion de caisse',     permission: 'view_cash_session'      },
      { href: '/orders',            icon: ClipboardList, label: 'Commandes',          permission: 'view_orders'            },
      { href: '/services',          icon: Wrench,        label: 'Prestations',        permission: 'view_services'          },
      { href: '/contrats',          icon: FileSignature, label: 'Contrats & Location',   permission: 'view_contrats'          },
      { href: '/voitures',          icon: Car,           label: 'Vente de Voitures',  permission: 'view_voitures'          },
      { href: '/menu-du-jour',      icon: CalendarDays,  label: 'Menu du jour',       permission: 'view_menu_du_jour'      },
    ]
  },
  {
    label: 'Livraison & Terrain',
    items: [
      { href: '/livraison',         icon: Truck,         label: 'Suivi Livraisons',   permission: 'view_livraisons'        },
      { href: '/livreurs',          icon: UserCheck,     label: 'Gestion Livreurs',   permission: 'view_livreurs'          },
      { href: '/team-tracking',     icon: MapPin,        label: 'Tracking Terrain',   permission: 'view_team_tracking'     },
    ]
  },
  {
    label: 'Catalogue & Stock',
    items: [
      { href: '/products',          icon: Package,       label: 'Produits',           permission: 'view_products'          },
      { href: '/categories',        icon: LayoutGrid,    label: 'Catégories',         permission: 'view_categories'        },
      { href: '/approvisionnement', icon: Warehouse,     label: 'Approvisionnement',  permission: 'view_approvisionnement' },
      { href: '/revendeurs',        icon: Store,         label: 'Revendeurs',         permission: 'view_revendeurs'        },
      { href: '/hotel',             icon: BedDouble,     label: 'Hôtel',              permission: 'view_hotel'             },
    ]
  },
  {
    label: 'Espace Juridique',
    items: [
      { href: '/dossiers',          icon: Scale,         label: 'Gestion Dossiers',   permission: 'view_dossiers'          },
      { href: '/honoraires',        icon: Receipt,       label: 'Facturation Honoraires', permission: 'view_honoraires'     },
    ]
  },
  {
    label: 'Finance & Comptabilité',
    items: [
      { href: '/analytics',         icon: BarChart2,     label: 'Tableau de bord',    permission: 'view_analytics'         },
      { href: '/depenses',          icon: TrendingDown,  label: 'Suivi Dépenses',     permission: 'view_depenses'          },
      { href: '/comptabilite',      icon: BookOpen,      label: 'États Comptables',   permission: 'view_comptabilite'      },
    ]
  },
  {
    label: 'Administration',
    items: [
      { href: '/clients',           icon: Users,         label: 'Base Clients',       permission: 'view_clients'           },
      { href: '/coupons',           icon: Tag,           label: 'Coupons & Remises',  permission: 'view_coupons'           },
      { href: '/whatsapp',          icon: MessageCircle, label: 'WhatsApp Business',  permission: 'view_whatsapp'          },
      { href: '/staff',             icon: UsersRound,    label: 'Équipe & Paie',      permission: 'view_staff'             },
      { href: '/recovery',          icon: History,       label: 'Récupération Données', permission: 'view_recovery'         },
      { href: '/activity',          icon: ScrollText,    label: 'Journal Audit',      permission: 'view_activity'          },
      { href: '/settings',          icon: Settings,      label: 'Paramètres',         permission: 'view_settings'          },
    ]
  }
];

export const NAV_ITEMS = NAV_SECTIONS.flatMap(section => section.items);

// --- Bottom nav (mobile) -- 5 items max ---------------------------------------

export const BOTTOM_NAV = [
  { href: '/pos',     icon: ShoppingCart,  label: 'Caisse'     },
  { href: '/orders',  icon: ClipboardList, label: 'Commandes'  },
  { href: '/products',icon: Package,       label: 'Produits'   },
  { href: '/analytics',icon: BarChart2,   label: 'Stats'      },
] as const;
