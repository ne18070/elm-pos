'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ShoppingCart, Package, ClipboardList,
  BarChart2, Settings, LogOut, Tag, LayoutGrid, ShieldCheck, Truck, Warehouse,
  Monitor, HelpCircle, BookOpen, ScrollText, Store, Sun, Moon, SunMoon, Vault, History, BedDouble, TrendingDown, Users, MessageCircle, ChevronLeft, ChevronRight, CalendarDays, UserCheck,
  Scale, Receipt, Menu, X, FileSignature, UsersRound, MapPin,
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
import { useLowStockAlerts } from '@/hooks/useLowStockAlerts';
import { hasRole, getRoleLabel } from '@/lib/permissions';
import { useState, useEffect } from 'react';

import { useCan } from '@/hooks/usePermission';
import type { PermissionKey } from '@/lib/permissions-map';

export const NAV_ITEMS: { href: string; icon: any; label: string; permission: PermissionKey | null; feature: string | null; bizTypes: string[] | null }[] = [
  { href: '/pos',               icon: ShoppingCart,  label: 'Caisse',             permission: 'view_pos',               feature: 'caisse',            bizTypes: null           },
  { href: '/caisse',            icon: Vault,         label: 'Clôture caisse',     permission: 'view_cash_session',      feature: 'caisse',            bizTypes: null           },
  { href: '/livraison',         icon: Truck,         label: 'Livraisons',         permission: 'view_livraisons',        feature: 'livraison',         bizTypes: null           },
  { href: '/livreurs',          icon: UserCheck,     label: 'Livreurs',           permission: 'view_livreurs',          feature: 'livraison',         bizTypes: null           },
  { href: '/orders',            icon: ClipboardList, label: 'Commandes',          permission: 'view_orders',            feature: null,                bizTypes: null           },
  { href: '/clients',           icon: Users,         label: 'Clients',            permission: 'view_clients',           feature: null,                bizTypes: null           },
  { href: '/products',          icon: Package,       label: 'Produits',           permission: 'view_products',          feature: 'stock',             bizTypes: null           },
  { href: '/approvisionnement', icon: Warehouse,     label: 'Approvisionnement',  permission: 'view_approvisionnement', feature: 'approvisionnement', bizTypes: null           },
  { href: '/revendeurs',        icon: Store,         label: 'Revendeurs',         permission: 'view_revendeurs',        feature: 'revendeurs',        bizTypes: null           },
  { href: '/hotel',             icon: BedDouble,     label: 'Hôtel',              permission: 'view_hotel',             feature: 'hotel',             bizTypes: null           },
  { href: '/categories',        icon: LayoutGrid,    label: 'Catégories',         permission: 'view_categories',        feature: 'stock',             bizTypes: null           },
  { href: '/coupons',           icon: Tag,           label: 'Coupons',            permission: 'view_coupons',           feature: 'coupons',           bizTypes: null           },
  { href: '/analytics',         icon: BarChart2,     label: 'Statistiques',       permission: 'view_analytics',         feature: null,                bizTypes: null           },
  { href: '/depenses',          icon: TrendingDown,  label: 'Dépenses',           permission: 'view_depenses',          feature: null,                bizTypes: null           },
  { href: '/comptabilite',      icon: BookOpen,      label: 'Comptabilité',       permission: 'view_comptabilite',      feature: 'comptabilite',      bizTypes: null           },
  { href: '/activity',          icon: ScrollText,    label: 'Journal',            permission: 'view_activity',          feature: null,                bizTypes: null           },
  { href: '/recovery',          icon: History,       label: 'Récupération',       permission: 'view_recovery',          feature: null,                bizTypes: null           },
  { href: '/dossiers',          icon: Scale,         label: 'Dossiers & Affaires', permission: 'view_dossiers',          feature: 'dossiers',          bizTypes: null           },
  { href: '/honoraires',        icon: Receipt,       label: 'Honoraires',         permission: 'view_honoraires',        feature: 'honoraires',        bizTypes: null           },
  { href: '/contrats',          icon: FileSignature, label: 'Contrats & Location', permission: 'view_contrats',          feature: 'contrats',          bizTypes: null           },
  { href: '/staff',             icon: UsersRound,    label: 'Personnel & Paie',   permission: 'view_staff',             feature: 'staff',             bizTypes: null           },
  { href: '/team-tracking',     icon: MapPin,        label: 'Tracking terrain',   permission: 'view_team_tracking',     feature: 'tracking',          bizTypes: null           },
  { href: '/menu-du-jour',      icon: CalendarDays,  label: 'Menu du jour',       permission: 'view_menu_du_jour',      feature: null,                bizTypes: ['restaurant'] },
  { href: '/whatsapp',          icon: MessageCircle, label: 'WhatsApp',           permission: 'view_whatsapp',          feature: 'whatsapp',          bizTypes: null           },
  { href: '/settings',          icon: Settings,      label: 'Paramètres',         permission: 'view_settings',          feature: null,                bizTypes: null           },
];

const COLLAPSED_KEY = 'elm-pos-sidebar-collapsed';

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
  onClose,
  onCollapse,
}: {
  collapsed: boolean;
  onClose?: () => void;   // mobile drawer close
  onCollapse?: () => void; // desktop collapse toggle
}) {
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

  function handleOpenDisplay() {
    if (window.electronAPI?.display?.open) {
      window.electronAPI.display.open();
    } else {
      window.open('/display', '_blank');
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setSubscription(null);
    setLoaded(false);
    const { setSession: setCash, setLoaded: setCashLoaded } = useCashSessionStore.getState();
    setCash(null);
    setCashLoaded(false);
    clear();
  }

  const visibleItems = NAV_ITEMS
    .filter(({ permission }) => !permission || can(permission))
    .filter(({ feature, bizTypes }) => {
      const features = business?.features ?? [];
      const bizType  = business?.type ?? '';
      if (feature && !features.includes(feature)) return false;
      if (bizTypes && bizType && !(bizTypes as readonly string[]).includes(bizType)) return false;
      return true;
    });

  return (
    <div className="flex flex-col h-full">
      {/* Header : business switcher + close (mobile) */}
      <div className="px-2 pt-3 pb-2 border-b border-surface-border flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <BusinessSwitcher collapsed={collapsed} />
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-surface-hover transition-colors shrink-0">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-0.5 px-2">
        {visibleItems.map(({ href, icon: Icon, label }) => {
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
                'flex items-center gap-3 px-2 py-2.5 rounded-xl transition-colors duration-150',
                collapsed ? 'justify-center' : '',
                active
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-surface-hover'
              )}
            >
              <div className="relative shrink-0">
                <Icon className="w-5 h-5" />
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5
                                   flex items-center justify-center rounded-full
                                   bg-red-500 text-white text-[9px] font-bold leading-none">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
                {sessionDot && (
                  <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-surface-card
                    ${cashSession ? 'bg-green-400' : 'bg-slate-600'}`}
                  />
                )}
              </div>
              {expanded && (
                <>
                  <span className="text-sm font-medium flex-1">{label}</span>
                  {badge > 0 && (
                    <span className="flex items-center justify-center min-w-[20px] h-5 px-1
                                     rounded-full bg-red-500 text-white text-xs font-bold">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Offline + terminal */}
      {expanded && (
        <div className="px-2 py-2 space-y-1">
          <OfflineBadge />
          <TerminalStatus />
        </div>
      )}

      {/* Footer actions */}
      <div className="px-2 py-3 border-t border-surface-border space-y-0.5">
        {(business?.features ?? []).includes('tracking') && (
          <TeamTracker collapsed={collapsed} />
        )}
        <NotificationBell collapsed={collapsed} />

        <Link
          href="/help"
          onClick={onClose}
          title={collapsed ? 'Aide' : undefined}
          className={cn(
            'w-full flex items-center gap-3 px-2 py-2 rounded-xl transition-colors',
            collapsed ? 'justify-center' : '',
            pathname.startsWith('/help') ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white hover:bg-surface-hover'
          )}
        >
          <HelpCircle className="w-4 h-4 shrink-0" />
          {expanded && <span className="text-sm">Aide</span>}
        </Link>

        <button
          onClick={handleOpenDisplay}
          title="Ouvrir l'écran client"
          className={cn(
            'w-full flex items-center gap-3 px-2 py-2 rounded-xl transition-colors text-slate-400 hover:text-white hover:bg-surface-hover',
            collapsed ? 'justify-center' : '',
          )}
        >
          <Monitor className="w-4 h-4 shrink-0" />
          {expanded && <span className="text-sm">Écran client</span>}
        </button>

        <Link
          href="/admin"
          onClick={onClose}
          title={collapsed ? (isAdmin ? 'Administration' : 'Mon profil') : undefined}
          className={cn(
            'w-full flex items-center gap-3 px-2 py-2 rounded-xl transition-colors',
            collapsed ? 'justify-center' : '',
            pathname.startsWith('/admin') ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white hover:bg-surface-hover'
          )}
        >
          <ShieldCheck className="w-4 h-4 shrink-0" />
          {expanded && <span className="text-sm">{isAdmin ? 'Administration' : 'Mon profil'}</span>}
        </Link>

        {/* Identité */}
        <div className={cn('flex items-center gap-3 px-2 py-2', collapsed ? 'justify-center' : '')}>
          <div className="w-8 h-8 rounded-lg bg-surface-input overflow-hidden flex items-center justify-center
                          text-sm font-bold text-brand-400 shrink-0">
            {user?.avatar_url
              ? <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
              : user?.full_name?.charAt(0).toUpperCase() ?? '?'}
          </div>
          {expanded && (
            <div className="min-w-0">
              <p className="text-xs font-medium text-white truncate">{user?.full_name}</p>
              <p className="text-xs text-slate-500 capitalize">{getRoleLabel(role)}</p>
            </div>
          )}
        </div>

        {/* Thème */}
        <button
          onClick={cycleTheme}
          title={collapsed ? 'Changer le thème' : undefined}
          className={cn(
            'w-full flex items-center gap-3 px-2 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-surface-hover transition-colors',
            collapsed ? 'justify-center' : '',
          )}
        >
          {theme === 'light'  ? <Sun     className="w-4 h-4 shrink-0" /> :
           theme === 'dark'   ? <Moon    className="w-4 h-4 shrink-0" /> :
                                <SunMoon className="w-4 h-4 shrink-0" />}
          {expanded && (
            <span className="text-sm">
              {theme === 'light' ? 'Mode clair' : theme === 'dark' ? 'Mode sombre' : 'Auto'}
            </span>
          )}
        </button>

        {/* Déconnexion */}
        <button
          onClick={handleLogout}
          title={collapsed ? 'Déconnexion' : undefined}
          className={cn(
            'w-full flex items-center gap-3 px-2 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-surface-hover transition-colors',
            collapsed ? 'justify-center' : '',
          )}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {expanded && <span className="text-sm">Déconnexion</span>}
        </button>

        {/* Collapse (desktop only) */}
        {onCollapse && (
          <button
            onClick={onCollapse}
            title={collapsed ? 'Agrandir' : 'Réduire'}
            className={cn(
              'w-full flex items-center gap-3 px-2 py-2 rounded-xl text-slate-500 hover:text-white hover:bg-surface-hover transition-colors',
              collapsed ? 'justify-center' : '',
            )}
          >
            {collapsed
              ? <ChevronRight className="w-4 h-4 shrink-0" />
              : <ChevronLeft  className="w-4 h-4 shrink-0" />}
            {expanded && <span className="text-sm">Réduire</span>}
          </button>
        )}
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
        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-surface-hover transition-colors"
      >
        <Menu className="w-5 h-5" />
      </button>
      <p className="text-sm font-semibold text-white truncate flex-1">
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
    if (href === '/pos' && !features.includes('caisse')) return false;
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
              active ? 'text-brand-400' : 'text-slate-500 hover:text-slate-300'
            )}
          >
            <div className="relative">
              <Icon className="w-5 h-5" />
              {badge > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5
                                 flex items-center justify-center rounded-full
                                 bg-red-500 text-white text-[9px] font-bold leading-none">
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
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem(COLLAPSED_KEY);
    return saved === null ? true : saved === 'true';
  });
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  // Close drawer on route change
  const pathname = usePathname();
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside className={cn(
        'hidden md:flex h-full bg-surface-card border-r border-surface-border flex-col shrink-0 transition-all duration-200',
        collapsed ? 'w-16' : 'w-60',
      )}>
        <SidebarContent
          collapsed={collapsed}
          onCollapse={() => setCollapsed((c) => !c)}
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
        'md:hidden fixed inset-y-0 left-0 z-50 w-72 bg-surface-card border-r border-surface-border flex flex-col',
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
