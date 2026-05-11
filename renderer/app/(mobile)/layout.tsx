'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart2, Truck, Package, Settings,
  ClipboardList, Wrench, Users, Scale, FileSignature, Car,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { InactivityGuard } from '@/components/shared/InactivityGuard';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { getBusinessKind } from '@/lib/business-kind';
import type { BusinessKind } from '@/lib/business-kind';

// ─── Nav config per business kind ───────────────────────────────────────────

const NAV_BY_KIND: Record<BusinessKind, { href: string; icon: React.ElementType; label: string }[]> = {
  boutique: [
    { href: '/m/owner',     icon: BarChart2,      label: 'Stats'     },
    { href: '/m/delivery',  icon: Truck,           label: 'Livraison' },
    { href: '/m/inventory', icon: Package,         label: 'Stock'     },
    { href: '/settings',    icon: Settings,        label: 'Réglages'  },
  ],
  restaurant: [
    { href: '/m/owner',    icon: BarChart2,      label: 'Stats'     },
    { href: '/m/orders',   icon: ClipboardList,  label: 'Commandes' },
    { href: '/m/delivery', icon: Truck,           label: 'Livraison' },
    { href: '/settings',   icon: Settings,        label: 'Réglages'  },
  ],
  location: [
    { href: '/m/owner',    icon: BarChart2,      label: 'Stats'     },
    { href: '/m/contrats', icon: FileSignature,  label: 'Contrats'  },
    { href: '/m/vehicles', icon: Car,             label: 'Véhicules' },
    { href: '/settings',   icon: Settings,        label: 'Réglages'  },
  ],
  service: [
    { href: '/m/owner',    icon: BarChart2, label: 'Stats'      },
    { href: '/m/services', icon: Wrench,    label: 'Prestations'},
    { href: '/m/clients',  icon: Users,     label: 'Clients'    },
    { href: '/settings',   icon: Settings,  label: 'Réglages'   },
  ],
  juridique: [
    { href: '/m/owner',    icon: BarChart2, label: 'Stats'    },
    { href: '/m/dossiers', icon: Scale,     label: 'Dossiers' },
    { href: '/m/clients',  icon: Users,     label: 'Clients'  },
    { href: '/settings',   icon: Settings,  label: 'Réglages' },
  ],
  autre: [
    { href: '/m/owner',   icon: BarChart2,     label: 'Stats'     },
    { href: '/m/orders',  icon: ClipboardList, label: 'Commandes' },
    { href: '/m/clients', icon: Users,         label: 'Clients'   },
    { href: '/settings',  icon: Settings,      label: 'Réglages'  },
  ],
};

// ─── Layout ─────────────────────────────────────────────────────────────────

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { business } = useAuthStore();

  const kind = getBusinessKind(business);
  const nav  = NAV_BY_KIND[kind];

  return (
    <div className="flex flex-col h-screen bg-surface-base overflow-hidden">
      <InactivityGuard />

      {/* Top Bar */}
      <header className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 bg-surface-card border-b border-surface-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white p-1 overflow-hidden border border-surface-border">
            <img src="/logo.png" alt="ELM" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-sm font-bold truncate max-w-[150px]">
            {business?.name ?? 'ELM Mobile'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[10px] font-black uppercase tracking-widest text-content-muted">Live</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto custom-scrollbar">
        <ErrorBoundary section="mobile">
          <div className="p-4 pb-24">
            {children}
          </div>
        </ErrorBoundary>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-surface-card border-t border-surface-border flex items-center justify-around pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 z-50">
        {nav.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || (href !== '/settings' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-1 px-4 py-1 transition-all',
                active ? 'text-brand-500' : 'text-content-muted hover:text-content-primary'
              )}
            >
              <div className={cn(
                'p-2 rounded-xl transition-all',
                active ? 'bg-brand-500/10 scale-110' : ''
              )}>
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-tight">{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
