'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  LayoutDashboard, Layers, Users, CreditCard, 
  Settings, Megaphone, Mail, LogOut, ChevronLeft,
  ChevronRight, Search, Bell, BarChart2, Smartphone,
  Command, Package, Grid3X3, HelpCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { getSubscriptionRequests, getPublicSubscriptionRequests } from '@services/supabase/subscriptions';
import { getAllTicketsAdmin } from '@services/supabase/support';
import { CommandPalette } from '@/components/ui/CommandPalette';

interface NavItem {
  label: string;
  href: string;
  icon: any;
  badge?: number;
}

export default function BackofficeLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, business, clear } = useAuthStore();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [supportCount, setSupportCount] = useState(0);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  async function handleLogout() {
    await supabase.auth.signOut();
    clear();
    router.push('/login');
  }

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsCommandPaletteOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  useEffect(() => {
    // Check if user is superadmin (simplified check, should be more robust)
    if (user && !user.is_superadmin) {
      router.push('/dashboard');
    }
  }, [user, router]);

  useEffect(() => {
    Promise.all([
      getSubscriptionRequests().catch(() => []),
      getPublicSubscriptionRequests().catch(() => []),
      getAllTicketsAdmin().catch(() => []),
    ]).then(([reqs, pub, tickets]) => {
      setPendingCount(
        reqs.filter((r) => r.status === 'pending').length +
        pub.filter((r) => r.status === 'pending').length
      );
      setSupportCount(tickets.filter(t => t.status === 'open').length);
    });
  }, []);

  const navItems: NavItem[] = [
    { label: 'Tableau de bord', href: '/backoffice', icon: LayoutDashboard },
    { label: 'Organisations', href: '/backoffice/structures', icon: Layers },
    { label: 'Demandes', href: '/backoffice/demandes', icon: Users, badge: pendingCount },
    { label: 'Abonnements', href: '/backoffice/abonnements', icon: CreditCard },
    { label: 'Plans & Tarifs', href: '/backoffice/plans', icon: BarChart2 },
    { label: 'Support Client', href: '/backoffice/support', icon: HelpCircle, badge: supportCount },
    { label: 'Marketing', href: '/backoffice/marketing', icon: Megaphone },
    { label: 'Paramètres', href: '/backoffice/settings', icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      {/* Sidebar */}
      <aside 
        className={cn(
          "bg-surface-card border-r border-surface-border flex flex-col transition-all duration-300 z-30",
          isSidebarOpen ? "w-64" : "w-20"
        )}
      >
        <div className="p-6 flex items-center justify-between">
          <div className={cn("flex items-center gap-3 overflow-hidden transition-all", !isSidebarOpen && "w-0")}>
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center shrink-0 shadow-lg shadow-brand-500/20">
              <span className="text-white font-black text-xs">ELM</span>
            </div>
            <span className="text-white font-black tracking-tight text-sm whitespace-nowrap">BACKOFFICE</span>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-1.5 rounded-lg hover:bg-surface-input text-slate-500 transition-colors"
          >
            {isSidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto no-scrollbar">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group relative",
                  isActive 
                    ? "bg-brand-600 text-white shadow-lg shadow-brand-500/10" 
                    : "text-slate-400 hover:text-white hover:bg-surface-input"
                )}
              >
                <item.icon className={cn("w-5 h-5 shrink-0", isActive ? "text-white" : "text-slate-500 group-hover:text-slate-300")} />
                {isSidebarOpen && (
                  <span className="text-sm font-bold truncate">{item.label}</span>
                )}
                {item.badge !== undefined && item.badge > 0 && (
                  <span className={cn(
                    "absolute flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full text-[10px] font-black bg-red-500 text-white shadow-lg",
                    isSidebarOpen ? "right-3" : "top-1 right-1"
                  )}>
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-surface-border">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all group"
          >
            <LogOut className="w-5 h-5 text-slate-500 group-hover:text-red-400" />
            {isSidebarOpen && <span className="text-sm font-bold">Déconnexion</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Top Header */}
        <header className="h-16 border-b border-surface-border bg-surface/50 backdrop-blur-xl flex items-center justify-between px-8 z-20 shrink-0">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative max-w-md w-full hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input 
                type="text" 
                placeholder="Recherche globale... (Ctrl+K)" 
                className="w-full bg-surface-input/50 border-none focus:ring-1 focus:ring-brand-500/50 rounded-xl pl-10 h-10 text-sm transition-all cursor-pointer"
                readOnly
                onClick={() => setIsCommandPaletteOpen(true)}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-surface-border bg-surface text-[10px] font-black text-slate-500">
                <Command className="w-2.5 h-2.5" />
                <span>K</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end mr-2">
              <span className="text-xs font-black text-white leading-none">{user?.full_name}</span>
              <span className="text-[10px] font-bold text-brand-400 uppercase tracking-widest mt-1">Super Admin</span>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-surface-input border border-surface-border flex items-center justify-center shadow-inner overflow-hidden">
              <span className="text-sm font-black text-slate-500">{user?.full_name?.charAt(0).toUpperCase()}</span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto relative no-scrollbar">
          {children}
        </main>

        <CommandPalette isOpen={isCommandPaletteOpen} onClose={() => setIsCommandPaletteOpen(false)} />
      </div>
    </div>
  );
}
