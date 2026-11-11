import {
  ShoppingCart, ClipboardList, Package, LayoutGrid, Warehouse, Store, BedDouble,
  Truck, UserCheck, MapPin, Scale, Receipt, BarChart2, TrendingDown, BookOpen,
  Users, Tag, MessageCircle, UsersRound, ScrollText, Settings, Wrench, FileSignature, Car, CalendarDays, Vault, History, PackageCheck, ClipboardCheck,
  GraduationCap, DatabaseZap, Bot, Ticket, Zap, UserCircle, Megaphone
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { PermissionKey } from './permissions';
import type { BusinessType } from '@pos-types';

export type NavItem    = { href: string; icon: LucideIcon; label: string; permission: PermissionKey | null };
export type NavSection = { label: string; items: NavItem[] };

// ─── Sections partagées ────────────────────────────────────────────────────────

const S_VENTES: NavSection = {
  label: 'Ventes & Services',
  items: [
    { href: '/pos',             icon: ShoppingCart, label: 'Caisse (POS)',         permission: 'view_pos'          },
    { href: '/commande-rapide', icon: Zap,          label: 'Commande rapide',      permission: 'view_commande_rapide' },
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
    { href: '/inventaire',        icon: ClipboardCheck, label: 'Inventaire',    permission: 'view_inventaire'        },
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

const S_EVENEMENTS: NavSection = {
  label: 'Événements',
  items: [
    { href: '/evenements', icon: Ticket, label: 'Check-in Invités', permission: 'view_evenements' },
  ],
};

// Disponible pour tous les types d'établissement (view_marketing n'a pas de
// clé `feature`).
//
// L'entrée reste masquée tant que l'app Meta est en mode développement : dans
// cet état, seuls ses administrateurs et testeurs peuvent autoriser la
// connexion, un commerçant échouerait. À décommenter dès que l'App Review
// accorde l'accès avancé — sans attendre TikTok, les deux plateformes étant
// indépendantes : le module fonctionne avec une seule des deux connectée.
// La page répond déjà sur /marketing pour les tests. Même précédent que
// WhatsApp ci-dessous.
const S_MARKETING: NavSection = {
  label: 'Marketing & Publicité',
  items: [
    { href: '/marketing', icon: Megaphone, label: 'Publicités', permission: 'view_marketing' },
  ],
};

const S_ADMIN: NavSection = {
  label: 'Administration',
  items: [
    // { href: '/assistant', icon: Bot,          label: 'Assistant IA',          permission: 'view_ai_assistant' },
    { href: '/clients',   icon: Users,        label: 'Base Clients',           permission: 'view_clients'   },
    { href: '/coupons',   icon: Tag,          label: 'Coupons & Remises',      permission: 'view_coupons'   },
    // { href: '/whatsapp',  icon: MessageCircle,label: 'WhatsApp Business',      permission: 'view_whatsapp'  },
    { href: '/staff',     icon: UsersRound,   label: 'Équipe & Paie',          permission: 'view_staff'     },
    { href: '/mon-espace-rh', icon: UserCircle, label: 'Mon Espace RH',        permission: 'view_my_hr'     },
    { href: '/recovery',  icon: History,      label: 'Récupération Données',   permission: 'view_recovery'  },
    // { href: '/import',    icon: DatabaseZap,  label: 'Import base de données', permission: 'view_import'    },
    { href: '/activity',  icon: ScrollText,   label: 'Journal Audit',          permission: 'view_activity'  },
    { href: '/settings',  icon: Settings,     label: 'Paramètres',             permission: 'view_settings'  },
  ],
};

// ─── Nav par type d'établissement ─────────────────────────────────────────────

export const NAV_BY_TYPE: Record<BusinessType, NavSection[]> = {
  retail:     [S_VENTES,        S_STOCK,    S_LIVRAISON, S_FINANCE, S_EVENEMENTS, S_MARKETING, S_ADMIN],
  restaurant: [S_VENTES_SIMPLE, S_RESTAURATION, S_STOCK, S_LIVRAISON, S_FINANCE, S_EVENEMENTS, S_MARKETING, S_ADMIN],
  hotel:      [S_VENTES_SIMPLE, S_HEBERGEMENT, S_RESTAURATION, S_STOCK, S_FINANCE, S_EVENEMENTS, S_MARKETING, S_ADMIN],
  service:    [S_VENTES,        S_STOCK,    S_LIVRAISON, S_FINANCE, S_EVENEMENTS, S_MARKETING, S_ADMIN],
  juridique:  [S_JURIDIQUE,     S_FINANCE,  S_EVENEMENTS, S_MARKETING, S_ADMIN],
  education:  [S_SCOLARITE,     S_FINANCE,  S_EVENEMENTS, S_MARKETING, S_ADMIN],
  // Organisation "RH / SIRH uniquement" (create_business_v2, secteur 'rh') : ni vente,
  // ni stock, ni livraison — juste le suivi financier de base et l'administration
  // (dont Équipe & Paie). Un type dédié évite de réutiliser 'service', dont le nom
  // collisionne avec la feature 'service' (module Prestations/Ateliers) via le
  // fallback type→feature de hasFeature().
  rh:         [S_FINANCE,       S_MARKETING, S_ADMIN],
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

// ─── Modules principaux par métier ────────────────────────────────────────────
// Point d'entrée de chaque métier (CLAUDE.md › Business type UX contracts), par
// ordre de priorité : le premier accessible devient la page d'accueil
// (getDefaultRoute), les 4 premiers la barre du bas mobile. Une entrée que
// l'utilisateur ne peut pas ouvrir (droit ou module non activé) est sautée, et
// le reste du menu du métier complète la liste.
// Avant : une barre fixe Caisse/Commandes/Produits/Stats pour tous — réduite à
// « Stats » (voire vide) hors commerce — et un accueil pris dans l'ordre des
// menus de TOUS les métiers (un cabinet atterrissait sur le tableau de bord).

export const PRIMARY_NAV_BY_TYPE: Record<BusinessType, readonly string[]> = {
  retail:     ['/pos', '/orders', '/products', '/analytics'],
  restaurant: ['/pos', '/orders', '/products', '/analytics'],
  // Hôtel : le planning des chambres d'abord, la caisse (bar, room service) ensuite
  hotel:      ['/hotel', '/pos', '/orders', '/analytics'],
  // 'service' regroupe la location (contrats + flotte) et les ateliers : pour un
  // atelier, qui n'a pas ces modules, contrats et voitures sont sautés.
  service:    ['/contrats', '/voitures', '/services', '/clients', '/analytics'],
  juridique:  ['/dossiers', '/honoraires', '/clients', '/analytics'],
  education:  ['/eleves', '/classes', '/scolarite', '/bulletins'],
  rh:         ['/staff', '/mon-espace-rh', '/analytics'],
};

/** Libellés courts pour la barre du bas (la sidebar garde les libellés complets). */
const SHORT_LABELS: Record<string, string> = {
  '/pos':                'Caisse',
  '/caisse':             'Session',
  '/orders':             'Commandes',
  '/products':           'Produits',
  '/analytics':          'Stats',
  '/hotel':              'Hôtel',
  '/menu-du-jour':       'Menu',
  '/commandes-emporter': 'Emporter',
  '/services':           'Prestations',
  '/contrats':           'Contrats',
  '/voitures':           'Voitures',
  '/dossiers':           'Dossiers',
  '/honoraires':         'Honoraires',
  '/clients':            'Clients',
  '/eleves':             'Élèves',
  '/classes':            'Classes',
  '/scolarite':          'Scolarité',
  '/bulletins':          'Notes',
  '/staff':              'Équipe',
  '/mon-espace-rh':      'Mon RH',
  '/livraison':          'Livraisons',
  '/settings':           'Réglages',
};

/** Jamais proposés comme module principal : réglages, journaux, outils d'administration. */
const NOT_PRIMARY = new Set(['/settings', '/activity', '/recovery', '/marketing', '/coupons']);

export type PrimaryNavItem = NavItem & { shortLabel: string };

/**
 * Modules principaux accessibles à l'utilisateur pour ce métier, dans l'ordre
 * de PRIMARY_NAV_BY_TYPE, complétés par le reste du menu du métier.
 */
export function getPrimaryNav(
  type:  BusinessType | null | undefined,
  can:   (permission: PermissionKey) => boolean,
  limit = 4,
): PrimaryNavItem[] {
  const menu   = getNavSections(type).flatMap((s) => s.items);
  const byHref = new Map(menu.map((item) => [item.href, item]));
  const preferred = (type ? PRIMARY_NAV_BY_TYPE[type] ?? [] : [])
    .map((href) => byHref.get(href))
    .filter((item): item is NavItem => !!item);

  const result: PrimaryNavItem[] = [];
  const seen = new Set<string>();
  for (const item of [...preferred, ...menu]) {
    if (result.length >= limit) break;
    if (seen.has(item.href) || NOT_PRIMARY.has(item.href)) continue;
    seen.add(item.href);
    if (item.permission && !can(item.permission)) continue;
    result.push({ ...item, shortLabel: SHORT_LABELS[item.href] ?? item.label });
  }
  return result;
}
