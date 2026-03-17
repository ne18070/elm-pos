'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ShoppingCart, Package, ClipboardList,
  BarChart2, Settings, LogOut, Tag, LayoutGrid,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { OfflineBadge } from './OfflineBadge';

const NAV_ITEMS = [
  { href: '/pos',        icon: ShoppingCart,  label: 'Caisse'        },
  { href: '/orders',     icon: ClipboardList, label: 'Commandes'     },
  { href: '/products',   icon: Package,       label: 'Produits'      },
  { href: '/categories', icon: LayoutGrid,    label: 'Catégories'    },
  { href: '/coupons',    icon: Tag,           label: 'Coupons'       },
  { href: '/analytics',  icon: BarChart2,     label: 'Statistiques'  },
  { href: '/settings',   icon: Settings,      label: 'Paramètres'    },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, business, clear } = useAuthStore();

  async function handleLogout() {
    await supabase.auth.signOut();
    clear();
  }

  return (
    <aside className="w-16 lg:w-56 h-full bg-surface-card border-r border-surface-border flex flex-col shrink-0">
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-surface-border">
        <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center shrink-0">
          <ShoppingCart className="w-4 h-4 text-white" />
        </div>
        <span className="ml-3 font-bold text-white hidden lg:block truncate">
          {business?.name ?? 'Elm POS'}
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 space-y-1 px-2">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
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
        })}
      </nav>

      {/* Badge offline / sync — affiché uniquement si pertinent */}
      <div className="px-2 py-2 hidden lg:block">
        <OfflineBadge />
      </div>

      {/* Utilisateur */}
      <div className="px-2 py-3 border-t border-surface-border">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-8 h-8 rounded-lg bg-surface-input flex items-center justify-center
                          text-sm font-bold text-brand-400 shrink-0">
            {user?.full_name?.charAt(0).toUpperCase() ?? '?'}
          </div>
          <div className="hidden lg:block min-w-0">
            <p className="text-xs font-medium text-white truncate">{user?.full_name}</p>
            <p className="text-xs text-slate-500 capitalize">{user?.role}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-2 py-2 rounded-xl
                     text-slate-400 hover:text-white hover:bg-surface-hover transition-colors mt-1"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span className="text-sm hidden lg:block">Déconnexion</span>
        </button>
      </div>
    </aside>
  );
}
