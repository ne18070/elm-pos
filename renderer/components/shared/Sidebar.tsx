'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import {
  ShoppingCart, Package, ClipboardList,
  BarChart2, Settings, LogOut, Tag, LayoutGrid, Truck, Warehouse,
  Monitor, HelpCircle, BookOpen, ScrollText, Store, Sun, Moon, SunMoon, Vault, BedDouble, TrendingDown, Users, MessageCircle, CalendarDays, UserCheck,
  Scale, Receipt, Menu, X, FileSignature, UsersRound, MapPin, MessageSquareShare, Car, ChevronUp
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useSubscriptionStore } from '@/store/subscription';
import { useThemeStore } from '@/store/theme';
import { useCashSessionStore } from '@/store/cashSession';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { OfflineBadge } from './OfflineBadge';
import { BusinessSwitcher } from './BusinessSwitcher';
import { NotificationBell } from './NotificationBell';
import { TeamTracker } from './TeamTracker';
import { TerminalStatus } from './TerminalStatus';
import { SupportPanel } from './SupportPanel';
import { useLowStockAlerts } from '@/hooks/useLowStockAlerts';
import { hasRole, getRoleLabel } from '@/lib/permissions';
import { useState, useEffect } from 'react';
import { useSidebarStore } from '@/store/sidebar';

import { useCan } from '@/hooks/usePermission';
import type { PermissionKey } from '@/lib/permissions-map';

import { autoRecordDeparture, updateStaffHeartbeat } from '@services/supabase/staff';

export const NAV_SECTIONS: { 
  label: string; 
  items: { href: string; icon: any; label: string; permission: PermissionKey | null; feature: string | string[] | null; bizTypes: string[] | null }[] 
}[] = [
  {
    label: 'Ventes & Services',
    items: [
      { href: '/pos',               icon: ShoppingCart,  label: 'Caisse (POS)',       permission: 'view_pos',               feature: ['pos', 'caisse', 'retail'],   bizTypes: null           },
      { href: '/caisse',            icon: Vault,         label: 'Clôture caisse',     permission: 'view_cash_session',      feature: ['caisse', 'retail'],           bizTypes: null           },
      { href: '/orders',            icon: ClipboardList, label: 'Commandes',          permission: 'view_orders',            feature: ['pos', 'caisse', 'retail'],   bizTypes: null           },
      { href: '/contrats',          icon: FileSignature, label: 'Contrats & Actes',   permission: 'view_contrats',          feature: 'contrats',                    bizTypes: ['service']    },
      { href: '/voitures',          icon: Car,           label: 'Vente de Voitures',  permission: 'view_voitures',          feature: 'voitures',                    bizTypes: null           },
      { href: '/menu-du-jour',      icon: CalendarDays,  label: 'Menu du jour',       permission: 'view_menu_du_jour',      feature: null,                bizTypes: ['restaurant'] },
    ]
  },
  {
    label: 'Livraison & Terrain',
    items: [
      { href: '/livraison',         icon: Truck,         label: 'Suivi Livraisons',   permission: 'view_livraisons',        feature: ['livraison', 'delivery'], bizTypes: null           },
      { href: '/livreurs',          icon: UserCheck,     label: 'Gestion Livreurs',   permission: 'view_livreurs',          feature: ['livraison', 'delivery'], bizTypes: null           },
      { href: '/team-tracking',     icon: MapPin,        label: 'Tracking Terrain',   permission: 'view_team_tracking',     feature: 'tracking',          bizTypes: null           },
    ]
  },
  {
    label: 'Catalogue & Stock',
    items: [
      { href: '/products',          icon: Package,       label: 'Produits',           permission: 'view_products',          feature: ['stock', 'retail'], bizTypes: null           },
      { href: '/categories',        icon: LayoutGrid,    label: 'Catégories',         permission: 'view_categories',        feature: ['stock', 'retail'], bizTypes: null           },
      { href: '/approvisionnement', icon: Warehouse,     label: 'Approvisionnement',  permission: 'view_approvisionnement', feature: ['approvisionnement', 'stock'], bizTypes: null           },
      { href: '/revendeurs',        icon: Store,         label: 'Revendeurs',         permission: 'view_revendeurs',        feature: ['revendeurs', 'retail'], bizTypes: null           },
      { href: '/hotel',             icon: BedDouble,     label: 'Hôtel',              permission: 'view_hotel',             feature: 'hotel',             bizTypes: null           },
    ]
  },
  {
    label: 'Espace Juridique',
    items: [
      { href: '/dossiers',          icon: Scale,         label: 'Gestion Dossiers',   permission: 'view_dossiers',          feature: 'dossiers',          bizTypes: null           },
      { href: '/honoraires',        icon: Receipt,       label: 'Facturation Honoraires', permission: 'view_honoraires',     feature: 'honoraires',        bizTypes: null           },
    ]
  },
  {
    label: 'Finance & Comptabilité',
    items: [
      { href: '/analytics',         icon: BarChart2,     label: 'Tableau de bord',    permission: 'view_analytics',         feature: null,                bizTypes: null           },
      { href: '/depenses',          icon: TrendingDown,  label: 'Suivi Dépenses',     permission: 'view_depenses',          feature: ['expenses', 'comptabilite'], bizTypes: null           },
      { href: '/comptabilite',      icon: BookOpen,      label: 'États Comptables',   permission: 'view_comptabilite',      feature: 'comptabilite',      bizTypes: null           },
    ]
  },
  {
    label: 'Administration',
    items: [
      { href: '/clients',           icon: Users,         label: 'Base Clients',       permission: 'view_clients',           feature: null,                bizTypes: null           },
      { href: '/coupons',           icon: Tag,           label: 'Coupons & Remises',  permission: 'view_coupons',           feature: ['coupons', 'retail'], bizTypes: null           },
      { href: '/whatsapp',          icon: MessageCircle, label: 'WhatsApp Business',  permission: 'view_whatsapp',          feature: 'whatsapp',          bizTypes: null           },
      { href: '/staff',             icon: UsersRound,    label: 'Équipe & Paie',      permission: 'view_staff',             feature: 'staff',             bizTypes: null           },
      { href: '/activity',          icon: ScrollText,    label: 'Journal Audit',      permission: 'view_activity',          feature: null,                bizTypes: null           },
      { href: '/settings',          icon: Settings,      label: 'Paramètres',         permission: 'view_settings',          feature: null,                bizTypes: null           },
    ]
  }
];

export const NAV_ITEMS = NAV_SECTIONS.flatMap(section => section.items);

// ─── Bottom nav (mobile) ── 5 items max ───────────────────────────────────────

const BOTTOM_NAV = [
  { href: '/pos',     icon: ShoppingCart,  label: 'Caisse'     },
  { href: '/orders',  icon: ClipboardList, label: 'Commandes'  },
  { href: '/products',icon: Package,       label: 'Produits'   },
  { href: '/analytics',icon: BarChart2,   label: 'Stats'      },
] as const;

// ─── Sidebar content (shared between drawer and desktop) ─────────────────────

function SidebarContent({
  collapsed,
  isHovering = false,
  onClose,
}: {
  collapsed: boolean;
  isHovering?: boolean;
  onClose?: () => void;   // mobile drawer close
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, business, clear } = useAuthStore();
  const { setSubscription, setLoaded } = useSubscriptionStore();
  const { theme, cycle: cycleTheme } = useThemeStore();
  const { session: cashSession } = useCashSessionStore();
  const can = useCan();
  const role = user?.role ?? 'staff';
  const isAdmin = hasRole(role, 'admin');
  const { count: lowStockCount } = useLowStockAlerts(business?.id ?? '');
  const expanded = !collapsed;

  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [footerExpanded, setFooterExpanded] = useState(true);

  // Heartbeat pour le pointage staff (toutes les 10 minutes)
  useEffect(() => {
    if (!business?.id || !user?.id) return;
    
    // Premier appel immédiat
    updateStaffHeartbeat(business.id, user.id);

    const interval = setInterval(() => {
      updateStaffHeartbeat(business.id, user.id);
    }, 10 * 60 * 1000); // 10 minutes

    return () => clearInterval(interval);
  }, [business?.id, user?.id]);

  function handleOpenDisplay() {
    if (window.electronAPI?.display?.open) {
      window.electronAPI.display.open();
    } else {
      window.open('/display', '_blank');
    }
  }

  async function handleLogout() {
    // Pointage de départ automatique
    if (business?.id && user?.id) {
      await autoRecordDeparture(business.id, user.id).catch(() => {});
    }

    await supabase.auth.signOut();
    clear();
    setSubscription(null);
    setLoaded(false);
    const { setSession: setCash, setLoaded: setCashLoaded } = useCashSessionStore.getState();
    setCash(null);
    setCashLoaded(false);
    router.push('/login');
  }

  const visibleSections = NAV_SECTIONS.map(section => ({
    ...section,
    items: section.items.filter(({ href, permission, feature, bizTypes }) => {
      const canAccess = !permission || can(permission);
      const features = business?.features ?? [];
      const bizTypesArray = (business as any)?.types ?? [];
      const primaryType = business?.type ?? '';
      
      // Détection stricte du métier juridique via le tableau 'types'
      const isJuridiqueBiz = bizTypesArray.includes('juridique') || primaryType === 'juridique';
      
      // Filtrage des fonctionnalités (supporte les listes de clés)
      const hasFeature = !feature || (
        Array.isArray(feature) 
          ? feature.some(f => features.includes(f)) 
          : features.includes(feature)
      );

      // Filtrage par type d'établissement (supporte le tableau 'types')
      const hasBizType = !bizTypes || 
                         bizTypesArray.some((t: string) => bizTypes.includes(t)) || 
                         bizTypes.includes(primaryType);
      
      // Sécurité : On cache l'Espace Juridique si l'établissement n'est pas de type juridique
      if (section.label === 'Espace Juridique' && !isJuridiqueBiz) return false;

      return canAccess && hasFeature && hasBizType;
    })
  })).filter(section => section.items.length > 0);

  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    if (window.electronAPI?.app?.getVersion) {
      window.electronAPI.app.getVersion().then(setVersion);
    }
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* App Logo */}
      <div className="px-4 py-3 flex items-center">
        <div className="w-10 flex items-center justify-center shrink-0">
          <div className={cn(
            "rounded-xl bg-white flex items-center justify-center shrink-0 shadow-md border border-white/20 transition-all duration-300 overflow-hidden p-1",
            collapsed ? "w-10 h-10" : "w-20 h-8"
          )}>
            <img src="/logo.png" alt="ELM" className="w-full h-full object-contain" />
          </div>
        </div>
      </div>

      {/* Header : business switcher + close (mobile) */}
      <div className={cn(
        "relative z-40 px-2 border-b border-surface-border/50 flex items-center gap-2 transition-all duration-300",
        collapsed ? "max-h-0 opacity-0 pb-0 border-b-0 overflow-hidden" : "max-h-32 opacity-100 pb-4"
      )}>
        <div className="flex-1 min-w-0">
          <BusinessSwitcher collapsed={collapsed} isHovering={isHovering} />
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1.5 rounded-lg text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors shrink-0">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 min-h-0 overflow-y-auto py-2 space-y-4 px-2 custom-scrollbar">
        {visibleSections.map((section) => (
          <div key={section.label} className="space-y-1">
            <div className={cn(
              "px-3 transition-all duration-300 overflow-hidden",
              expanded ? "h-6 opacity-100" : "h-0 opacity-0"
            )}>
              <h3 className="text-[10px] font-bold text-content-muted uppercase tracking-widest mb-2 truncate">
                {section.label}
              </h3>
            </div>
            <div className="space-y-0.5">
              {section.items.map(({ href, icon: Icon, label }) => {
                const active = pathname.startsWith(href);
                const badge = href === '/products' && lowStockCount > 0 ? lowStockCount : 0;
                const sessionDot = href === '/caisse';
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onClose}
                    title={collapsed ? label : undefined}
                    className={cn(
                      'group flex items-center gap-0 rounded-xl transition-all duration-200 relative p-1',
                      active
                        ? 'bg-brand-500/10 text-content-brand shadow-sm'
                        : 'text-content-secondary hover:text-content-primary hover:bg-white/5'
                    )}
                  >
                    {active && (
                      <div className="absolute left-0 w-1 h-5 bg-brand-500 rounded-r-full" />
                    )}
                    <div className="w-10 h-10 flex items-center justify-center shrink-0 relative">
                      <Icon className={cn(
                        "w-5 h-5 transition-transform duration-200 group-hover:scale-110",
                        active ? "text-content-brand" : "text-content-secondary group-hover:text-content-primary"
                      )} />
                      {badge > 0 && (
                        <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-0.5
                                         flex items-center justify-center rounded-full
                                         bg-red-500 text-content-primary text-[9px] font-bold leading-none shadow-sm">
                          {badge > 99 ? '99+' : badge}
                        </span>
                      )}
                      {sessionDot && (
                        <span className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full border-2 border-surface-card
                          ${cashSession ? 'bg-green-400' : 'bg-slate-600'}`}
                        />
                      )}
                    </div>
                    <div className={cn(
                      "flex flex-1 items-center justify-between min-w-0 transition-all duration-300",
                      expanded ? "opacity-100 ml-2" : "opacity-0 w-0 pointer-events-none"
                    )}>
                      <span className={cn(
                        "text-sm font-medium truncate",
                        active ? "text-content-brand" : ""
                      )}>{label}</span>
                      {badge > 0 && (
                        <span className="flex items-center justify-center min-w-[20px] h-5 px-1
                                         rounded-full bg-red-500/20 text-status-error text-xs font-bold">
                          {badge > 99 ? '99+' : badge}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Offline + terminal */}
      <div className={cn(
        "px-2 py-2 space-y-1 transition-all duration-300",
        expanded ? "opacity-100" : "opacity-0 h-0 overflow-hidden"
      )}>
        <OfflineBadge />
        <TerminalStatus />
      </div>

      {/* Footer actions */}
      <div className="border-t border-surface-border/50">
        <button
          onClick={() => setFooterExpanded(v => !v)}
          className="w-full flex items-center justify-center py-1 text-content-muted hover:text-content-primary hover:bg-white/5 transition-colors"
          title={footerExpanded ? 'Réduire' : 'Développer'}
        >
          <ChevronUp className={cn("w-3.5 h-3.5 transition-transform duration-200", footerExpanded ? "rotate-0" : "rotate-180")} />
        </button>
      </div>
      <div className={cn(
        "px-2 space-y-1 overflow-hidden transition-all duration-300",
        footerExpanded ? "py-2 max-h-[500px] opacity-100" : "max-h-0 py-0 opacity-0 pointer-events-none"
      )}>
        <div className="space-y-0.5 mb-4">
          {(business?.features ?? []).includes('tracking') && role !== 'owner' && (
            <TeamTracker collapsed={collapsed} />
          )}
          <NotificationBell collapsed={collapsed} />

          <Link
            href="/help"
            onClick={onClose}
            title={collapsed ? 'Aide' : undefined}
            className={cn(
              'w-full flex items-center gap-0 rounded-xl transition-all duration-200 group p-1',
              pathname.startsWith('/help') ? 'bg-brand-500/10 text-content-brand' : 'text-content-secondary hover:text-content-primary hover:bg-white/5'
            )}
          >
            <div className="w-10 h-10 flex items-center justify-center shrink-0">
              <HelpCircle className="w-4 h-4 shrink-0 group-hover:scale-110 transition-transform" />
            </div>
            <div className={cn(
              "transition-all duration-300 truncate",
              expanded ? "opacity-100 ml-2" : "opacity-0 w-0"
            )}>
              <span className="text-sm font-medium">Centre d'aide</span>
            </div>
          </Link>

          <button
            onClick={() => setIsSupportOpen(true)}
            title="Signaler un problème"
            className={cn(
              'w-full flex items-center gap-0 rounded-xl transition-all duration-200 text-content-secondary hover:text-content-primary hover:bg-white/5 group p-1',
            )}
          >
            <div className="w-10 h-10 flex items-center justify-center shrink-0">
              <HelpCircle className="w-4 h-4 shrink-0 group-hover:scale-110 transition-transform text-status-warning" />
            </div>
            <div className={cn(
              "transition-all duration-300 truncate",
              expanded ? "opacity-100 ml-2" : "opacity-0 w-0"
            )}>
              <span className="text-sm font-medium">Signaler un problème</span>
            </div>
          </button>

          <SupportPanel isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />

          <button
            onClick={handleOpenDisplay}
            title="Ouvrir l'écran client"
            className={cn(
              'w-full flex items-center gap-0 rounded-xl transition-all duration-200 text-content-secondary hover:text-content-primary hover:bg-white/5 group p-1',
            )}
          >
            <div className="w-10 h-10 flex items-center justify-center shrink-0">
              <Monitor className="w-4 h-4 shrink-0 group-hover:scale-110 transition-transform" />
            </div>
            <div className={cn(
              "transition-all duration-300 truncate",
              expanded ? "opacity-100 ml-2" : "opacity-0 w-0"
            )}>
              <span className="text-sm font-medium">Écran client</span>
            </div>
          </button>
        </div>

        {/* User Profile Card */}
        <div className={cn(
          "mb-2 transition-all duration-300",
          expanded ? "bg-white/5 rounded-2xl p-2 border border-white/5" : ""
        )}>
          <Link
            href="/admin"
            onClick={onClose}
            title={collapsed ? (isAdmin ? 'Administration' : 'Mon profil') : undefined}
            className={cn(
              'flex items-center gap-0 rounded-xl transition-all duration-200 group p-1',
            )}
          >
            <div className="w-10 h-10 flex items-center justify-center shrink-0 relative">
              <div className="w-9 h-9 rounded-lg bg-brand-500/20 overflow-hidden flex items-center justify-center
                              text-sm font-bold text-content-brand border border-brand-500/30">
                {user?.avatar_url
                  ? <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                  : user?.full_name?.charAt(0).toUpperCase() ?? '?'}
              </div>
              <div className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-green-500 border-2 border-surface-card rounded-full" />
            </div>
            
            <div className={cn(
              "min-w-0 flex-1 transition-all duration-300",
              expanded ? "opacity-100 ml-2" : "opacity-0 w-0 overflow-hidden"
            )}>
              <p className="text-xs font-bold text-content-primary truncate leading-tight">{user?.full_name}</p>
              <p className="text-[10px] text-content-muted font-medium uppercase tracking-tight">{getRoleLabel(role)}</p>
            </div>
          </Link>

          <div className={cn(
            "transition-all duration-300 flex items-center gap-1",
            expanded ? "mt-2 pt-2 border-t border-white/5 h-auto opacity-100" : "h-0 opacity-0 overflow-hidden"
          )}>
            <button
              onClick={cycleTheme}
              title="Changer le thème"
              className="flex-1 flex items-center justify-center p-2 rounded-lg text-content-secondary hover:text-content-brand hover:bg-brand-500/10 transition-all group"
            >
              {theme === 'light'  ? <Sun     className="w-4 h-4 group-hover:rotate-45 transition-transform" /> :
               theme === 'dark'   ? <Moon    className="w-4 h-4 group-hover:-rotate-12 transition-transform" /> :
                                    <SunMoon className="w-4 h-4" />}
            </button>
            
            <button
              onClick={handleLogout}
              title="Déconnexion"
              className="flex-1 flex items-center justify-center p-2 rounded-lg text-content-secondary hover:text-status-error hover:bg-red-500/10 transition-all group"
            >
              <LogOut className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>

        {/* Version & Badge */}
        <div className="flex items-center px-2">
          <div className="w-10 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-mono text-slate-700">
              {version ? version.charAt(0) : '1'}
            </span>
          </div>
          <div className={cn(
            "flex items-center justify-between flex-1 min-w-0 transition-all duration-300",
            expanded ? "opacity-100 ml-1" : "opacity-0 w-0"
          )}>
            <span className="text-[10px] font-bold text-content-muted uppercase tracking-tighter truncate">
              ELM APP
            </span>
            <span className="text-[10px] font-mono text-slate-700 ml-1">
              v{version || '1.0.0'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Mobile top bar ───────────────────────────────────────────────────────────

export function MobileTopBar({ onMenuOpen }: { onMenuOpen: () => void }) {
  const { business } = useAuthStore();
  return (
    <div
      className="md:hidden flex items-center gap-3 px-4 py-3 bg-surface-card border-b border-surface-border shrink-0"
      style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}
    >
      <button
        onClick={onMenuOpen}
        className="p-1.5 rounded-lg text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors"
      >
        <Menu className="w-5 h-5" />
      </button>
      <p className="text-sm font-semibold text-content-primary truncate flex-1">
        {business?.name ?? 'Elm'}
      </p>
      <OfflineBadge compact />
    </div>
  );
}

// ─── Mobile bottom nav ────────────────────────────────────────────────────────

export function MobileBottomNav() {
  const pathname = usePathname();
  const { user, business } = useAuthStore();
  const { count: lowStockCount } = useLowStockAlerts(business?.id ?? '');
  const role = user?.role ?? 'staff';

  const visible = BOTTOM_NAV.filter(({ href }) => {
    const features = business?.features ?? [];
    if (href === '/pos' && !features.includes('caisse') && !features.includes('pos') && !features.includes('retail')) return false;
    if (href === '/products') {
      if (!features.includes('stock')) return false;
      if (!['owner','admin','manager'].includes(role)) return false;
    }
    return true;
  });

  return (
    <nav
      className="md:hidden flex items-center bg-surface-card border-t border-surface-border shrink-0"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {visible.map(({ href, icon: Icon, label }) => {
        const active = pathname.startsWith(href);
        const badge  = href === '/products' && lowStockCount > 0 ? lowStockCount : 0;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex-1 flex flex-col items-center gap-1 py-2.5 px-1 transition-colors relative',
              active ? 'text-content-brand' : 'text-content-muted hover:text-content-primary'
            )}
          >
            <div className="relative">
              <Icon className="w-5 h-5" />
              {badge > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5
                                 flex items-center justify-center rounded-full
                                 bg-red-500 text-content-primary text-[9px] font-bold leading-none">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium leading-none">{label}</span>
            {active && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-brand-500 rounded-full" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

// ─── Main Sidebar export ──────────────────────────────────────────────────────

export function Sidebar() {
  const collapsed = useSidebarStore((s) => s.collapsed);
  const [isHovering, setIsHovering] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close drawer on route change
  const pathname = usePathname();
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  const effectiveCollapsed = collapsed && !isHovering;

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside 
        onMouseEnter={() => collapsed && setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        className={cn(
          'theme-dark hidden md:flex h-full bg-surface-card border-r border-surface-border flex-col shrink-0 transition-all duration-300 ease-in-out z-30 shadow-xl',
          effectiveCollapsed ? 'w-16' : 'w-64',
        )}
      >
        <SidebarContent
          collapsed={effectiveCollapsed}
          isHovering={isHovering}
        />
      </aside>

      {/* ── Mobile drawer overlay ── */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* ── Mobile drawer ── */}
      <aside className={cn(
        'theme-dark md:hidden fixed inset-y-0 left-0 z-50 w-72 bg-surface-card border-r border-surface-border flex flex-col',
        'transition-transform duration-250',
        drawerOpen ? 'translate-x-0' : '-translate-x-full',
      )}>
        <SidebarContent
          collapsed={false}
          onClose={() => setDrawerOpen(false)}
        />
      </aside>

      {/* ── Expose open fn via data attr for MobileTopBar ── */}
      <div id="sidebar-drawer-trigger" className="hidden" data-open={String(drawerOpen)}
        onClick={() => setDrawerOpen(true)} />
    </>
  );
}

// ─── Hook to open drawer from outside ────────────────────────────────────────

export function useOpenSidebar() {
  return () => {
    document.getElementById('sidebar-drawer-trigger')?.click();
  };
}
