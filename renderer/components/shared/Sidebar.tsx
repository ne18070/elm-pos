'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ShoppingCart, Package, ClipboardList,
  BarChart2, Settings, LogOut, Tag, LayoutGrid, ShieldCheck, Truck, Warehouse,
  Monitor, HelpCircle, BookOpen, ScrollText, Store, Sun, Moon, SunMoon, Vault, History, BedDouble, TrendingDown, Users, MessageCircle, ChevronLeft, ChevronRight, CalendarDays, UserCheck,
  Scale, Receipt,
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
import { TerminalStatus } from './TerminalStatus';
import { useLowStockAlerts } from '@/hooks/useLowStockAlerts';
import { hasRole, getRoleLabel } from '@/lib/permissions';
import { useState, useEffect } from 'react';

// feature: null   = pas lié à un module → visible si le business a des features configurées
// feature: string = visible seulement si ce module est dans business.features
// bizTypes: null  = tous types d'établissement
// bizTypes: []    = visible uniquement si le type du business correspond
const MANAGER_ROLES = ['owner', 'admin', 'manager'] as const;

const NAV_ITEMS = [
  { href: '/pos',               icon: ShoppingCart,  label: 'Caisse',             roles: null,                feature: null,               bizTypes: null              },
  { href: '/caisse',            icon: Vault,         label: 'Clôture caisse',     roles: MANAGER_ROLES,       feature: null,               bizTypes: null              },
  { href: '/livraison',         icon: Truck,         label: 'Livraisons',         roles: null,                feature: 'livraison',        bizTypes: null              },
  { href: '/livreurs',          icon: UserCheck,     label: 'Livreurs',           roles: MANAGER_ROLES,       feature: 'livraison',        bizTypes: null              },
  { href: '/orders',            icon: ClipboardList, label: 'Commandes',          roles: null,                feature: null,               bizTypes: null              },
  { href: '/clients',           icon: Users,         label: 'Clients',            roles: MANAGER_ROLES,       feature: null,               bizTypes: null              },
  { href: '/products',          icon: Package,       label: 'Produits',           roles: MANAGER_ROLES,       feature: 'stock',            bizTypes: null              },
  { href: '/approvisionnement', icon: Warehouse,     label: 'Approvisionnement',  roles: MANAGER_ROLES,       feature: 'approvisionnement', bizTypes: null             },
  { href: '/revendeurs',        icon: Store,         label: 'Revendeurs',         roles: ['owner', 'admin'],  feature: 'revendeurs',       bizTypes: null              },
  { href: '/hotel',             icon: BedDouble,     label: 'Hôtel',              roles: null,                feature: 'hotel',            bizTypes: null              },
  { href: '/categories',        icon: LayoutGrid,    label: 'Catégories',         roles: MANAGER_ROLES,       feature: 'stock',            bizTypes: null              },
  { href: '/coupons',           icon: Tag,           label: 'Coupons',            roles: MANAGER_ROLES,       feature: 'coupons',          bizTypes: null              },
  { href: '/analytics',         icon: BarChart2,     label: 'Statistiques',       roles: MANAGER_ROLES,       feature: null,               bizTypes: null              },
  { href: '/depenses',          icon: TrendingDown,  label: 'Dépenses',           roles: MANAGER_ROLES,       feature: null,               bizTypes: null              },
  { href: '/comptabilite',      icon: BookOpen,      label: 'Comptabilité',       roles: MANAGER_ROLES,       feature: 'comptabilite',     bizTypes: null              },
  { href: '/activity',          icon: ScrollText,    label: 'Journal',            roles: MANAGER_ROLES,       feature: null,               bizTypes: null              },
  { href: '/recovery',          icon: History,       label: 'Récupération',       roles: ['owner', 'admin'],  feature: null,               bizTypes: null              },
  { href: '/dossiers',          icon: Scale,         label: 'Dossiers & Affaires', roles: MANAGER_ROLES,      feature: 'dossiers',         bizTypes: null              },
  { href: '/honoraires',        icon: Receipt,       label: 'Honoraires',         roles: MANAGER_ROLES,       feature: 'honoraires',       bizTypes: null              },
  { href: '/menu-du-jour',      icon: CalendarDays,  label: 'Menu du jour',       roles: MANAGER_ROLES,       feature: null,               bizTypes: ['restaurant']    },
  { href: '/whatsapp',          icon: MessageCircle, label: 'WhatsApp',           roles: MANAGER_ROLES,       feature: null,               bizTypes: null              },
  { href: '/settings',          icon: Settings,      label: 'Paramètres',         roles: null,                feature: null,               bizTypes: null              },
] as const;

const COLLAPSED_KEY = 'elm-pos-sidebar-collapsed';

export function Sidebar() {
  const pathname = usePathname();
  const { user, business, clear } = useAuthStore();
  const { setSubscription, setLoaded } = useSubscriptionStore();
  const { theme, cycle: cycleTheme } = useThemeStore();
  const { session: cashSession } = useCashSessionStore();
  const role = user?.role ?? 'staff';
  const isAdmin = hasRole(role, 'admin');
  const { count: lowStockCount } = useLowStockAlerts(business?.id ?? '');

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(COLLAPSED_KEY) === 'true';
  });

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

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

  const expanded = !collapsed;

  return (
    <aside className={cn(
      'h-full bg-surface-card border-r border-surface-border flex flex-col shrink-0 transition-all duration-200',
      expanded ? 'w-60' : 'w-16',
    )}>

      {/* Sélecteur d'établissement */}
      <div className="px-2 pt-3 pb-2 border-b border-surface-border">
        <BusinessSwitcher />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-0.5 px-2">
        {NAV_ITEMS
          .filter(({ roles }) => !roles || (roles as readonly string[]).includes(role))
          .filter(({ feature, bizTypes }) => {
            const features = business?.features ?? [];
            const bizType  = business?.type ?? '';

            // Filtre par module activé — strict, pas de fallback
            if (feature && !features.includes(feature)) return false;

            // Filtre par type d'établissement
            if (bizTypes && bizType && !(bizTypes as readonly string[]).includes(bizType)) return false;

            return true;
          })
          .map(({ href, icon: Icon, label }) => {
            const active = pathname.startsWith(href);
            const badge = href === '/products' && lowStockCount > 0 ? lowStockCount : 0;
            const sessionDot = href === '/caisse';
            return (
              <Link
                key={href}
                href={href}
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

      {/* Badge offline */}
      {expanded && (
        <div className="px-2 py-2 space-y-1">
          <OfflineBadge />
          <TerminalStatus />
        </div>
      )}

      {/* Utilisateur + Actions */}
      <div className="px-2 py-3 border-t border-surface-border space-y-0.5">
        {/* Notifications */}
        <NotificationBell />

        {/* Aide */}
        <Link
          href="/help"
          title={collapsed ? 'Aide' : undefined}
          className={cn(
            'w-full flex items-center gap-3 px-2 py-2 rounded-xl transition-colors',
            collapsed ? 'justify-center' : '',
            pathname.startsWith('/help')
              ? 'bg-brand-600 text-white'
              : 'text-slate-400 hover:text-white hover:bg-surface-hover'
          )}
        >
          <HelpCircle className="w-4 h-4 shrink-0" />
          {expanded && <span className="text-sm">Aide</span>}
        </Link>

        {/* Écran client */}
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
          title={collapsed ? (isAdmin ? 'Administration' : 'Mon profil') : undefined}
          className={cn(
            'w-full flex items-center gap-3 px-2 py-2 rounded-xl transition-colors',
            collapsed ? 'justify-center' : '',
            pathname.startsWith('/admin')
              ? 'bg-brand-600 text-white'
              : 'text-slate-400 hover:text-white hover:bg-surface-hover'
          )}
        >
          <ShieldCheck className="w-4 h-4 shrink-0" />
          {expanded && <span className="text-sm">{isAdmin ? 'Administration' : 'Mon profil'}</span>}
        </Link>

        {/* Identité */}
        <div className={cn('flex items-center gap-3 px-2 py-2', collapsed ? 'justify-center' : '')}>
          <div className="w-8 h-8 rounded-lg bg-surface-input overflow-hidden flex items-center justify-center
                          text-sm font-bold text-brand-400 shrink-0">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              user?.full_name?.charAt(0).toUpperCase() ?? '?'
            )}
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

        {/* Bouton collapse */}
        <button
          onClick={() => setCollapsed((c) => !c)}
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
      </div>
    </aside>
  );
}
