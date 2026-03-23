'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ShoppingCart, Package, ClipboardList,
  BarChart2, Settings, LogOut, Tag, LayoutGrid, ShieldCheck, Truck, Warehouse,
  Monitor, HelpCircle, BookOpen, ScrollText,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { OfflineBadge } from './OfflineBadge';
import { BusinessSwitcher } from './BusinessSwitcher';

const NAV_ITEMS = [
  { href: '/pos',               icon: ShoppingCart, label: 'Caisse',             roles: null },
  { href: '/livraison',         icon: Truck,        label: 'Livraisons',         roles: null },
  { href: '/orders',            icon: ClipboardList,label: 'Commandes',          roles: null },
  { href: '/products',          icon: Package,      label: 'Produits',           roles: ['owner', 'admin'] },
  { href: '/approvisionnement', icon: Warehouse,    label: 'Approvisionnement',  roles: ['owner', 'admin'] },
  { href: '/categories',        icon: LayoutGrid,   label: 'Catégories',         roles: ['owner', 'admin'] },
  { href: '/coupons',           icon: Tag,          label: 'Coupons',            roles: ['owner', 'admin'] },
  { href: '/analytics',         icon: BarChart2,    label: 'Statistiques',       roles: ['owner', 'admin'] },
  { href: '/comptabilite',      icon: BookOpen,     label: 'Comptabilité',       roles: ['owner', 'admin'] },
  { href: '/activity',          icon: ScrollText,   label: 'Journal',            roles: ['owner', 'admin'] },
  { href: '/settings',          icon: Settings,     label: 'Paramètres',         roles: null },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { user, clear } = useAuthStore();
  const role = user?.role ?? 'staff';
  const isAdmin = role === 'owner' || role === 'admin';

  function handleOpenDisplay() {
    if (window.electronAPI?.display?.open) {
      window.electronAPI.display.open();
    } else {
      window.open('/display', '_blank');
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    clear();
  }

  return (
    <aside className="w-16 lg:w-60 h-full bg-surface-card border-r border-surface-border flex flex-col shrink-0">

      {/* Sélecteur d'établissement */}
      <div className="px-2 pt-3 pb-2 border-b border-surface-border">
        <BusinessSwitcher />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-0.5 px-2">
        {NAV_ITEMS.filter(({ roles }) => !roles || roles.includes(role as 'owner' | 'admin')).map(
          ({ href, icon: Icon, label }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 px-2 py-2.5 rounded-xl transition-colors duration-150',
                  active
                    ? 'bg-brand-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-surface-hover'
                )}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="text-sm font-medium hidden lg:block">{label}</span>
              </Link>
            );
          }
        )}
      </nav>

      {/* Badge offline */}
      <div className="px-2 py-2 hidden lg:block">
        <OfflineBadge />
      </div>

      {/* Utilisateur + Admin */}
      <div className="px-2 py-3 border-t border-surface-border space-y-0.5">
        {/* Aide */}
        <Link
          href="/help"
          className={cn(
            'w-full flex items-center gap-3 px-2 py-2 rounded-xl transition-colors',
            pathname.startsWith('/help')
              ? 'bg-brand-600 text-white'
              : 'text-slate-400 hover:text-white hover:bg-surface-hover'
          )}
        >
          <HelpCircle className="w-4 h-4 shrink-0" />
          <span className="text-sm hidden lg:block">Aide</span>
        </Link>

        {/* Écran client */}
        <button
          onClick={handleOpenDisplay}
          title="Ouvrir l'écran client"
          className="w-full flex items-center gap-3 px-2 py-2 rounded-xl transition-colors text-slate-400 hover:text-white hover:bg-surface-hover"
        >
          <Monitor className="w-4 h-4 shrink-0" />
          <span className="text-sm hidden lg:block">Écran client</span>
        </button>

        {isAdmin && (
          <Link
            href="/admin"
            className={cn(
              'w-full flex items-center gap-3 px-2 py-2 rounded-xl transition-colors',
              pathname.startsWith('/admin')
                ? 'bg-brand-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-surface-hover'
            )}
          >
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span className="text-sm hidden lg:block">Administration</span>
          </Link>
        )}

        {/* Identité */}
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-8 h-8 rounded-lg bg-surface-input overflow-hidden flex items-center justify-center
                          text-sm font-bold text-brand-400 shrink-0">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              user?.full_name?.charAt(0).toUpperCase() ?? '?'
            )}
          </div>
          <div className="hidden lg:block min-w-0">
            <p className="text-xs font-medium text-white truncate">{user?.full_name}</p>
            <p className="text-xs text-slate-500 capitalize">
              {role === 'owner' ? 'Propriétaire' : role === 'admin' ? 'Administrateur' : 'Caissier'}
            </p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-2 py-2 rounded-xl
                     text-slate-400 hover:text-white hover:bg-surface-hover transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span className="text-sm hidden lg:block">Déconnexion</span>
        </button>
      </div>
    </aside>
  );
}
