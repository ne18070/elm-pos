'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Search, ShoppingCart, Package, ClipboardList, BarChart2, 
  Settings, Users, Tag, LayoutGrid, Warehouse, Truck, 
  BookOpen, ScrollText, History, MessageCircle 
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

import { useThemeStore } from '@/store/theme';

const NAV_COMMANDS = [
  { href: '/pos',               icon: ShoppingCart,  label: 'Caisse',             desc: 'Encaisser des ventes' },
  { href: '/orders',            icon: ClipboardList, label: 'Commandes',          desc: 'Historique des ventes' },
  { href: '/products',          icon: Package,       label: 'Produits',           desc: 'Gérer le catalogue' },
  { href: '/stock',             icon: Warehouse,     label: 'Stock',              desc: 'État des stocks' },
  { href: '/clients',           icon: Users,         label: 'Clients',            desc: 'Base de données clients' },
  { href: '/analytics',         icon: BarChart2,     label: 'Statistiques',       desc: 'Rapports et CA' },
  { href: '/livraison',         icon: Truck,         label: 'Livraisons',         desc: 'Suivi des livraisons' },
  { href: '/categories',        icon: LayoutGrid,    label: 'Catégories',         desc: 'Organiser les produits' },
  { href: '/coupons',           icon: Tag,           label: 'Coupons',            desc: 'Promotions et remises' },
  { href: '/comptabilite',      icon: BookOpen,      label: 'Comptabilité',       desc: 'Journaux et bilan' },
  { href: '/activity',          icon: ScrollText,    label: 'Journal d\'audit',   desc: 'Traçabilité des actions' },
  { href: '/whatsapp',          icon: MessageCircle, label: 'WhatsApp',           desc: 'Communications clients' },
  { href: '/settings',          icon: Settings,      label: 'Paramètres',         desc: 'Configuration système' },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const router = useRouter();
  const { business } = useAuthStore();
  const { cycle: cycleTheme } = useThemeStore();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const isCmd = e.metaKey || e.ctrlKey;
      
      // Ctrl+K : Open Palette
      if (e.key === 'k' && isCmd) {
        e.preventDefault();
        setOpen((open) => !open);
      }
      
      // Global shortcuts (only if not in an input, or if Ctrl is pressed)
      if (isCmd) {
        if (e.key === 't') { e.preventDefault(); cycleTheme(); }
        if (e.key === 'j') { e.preventDefault(); router.push('/activity'); setOpen(false); }
        if (e.key === ',') { e.preventDefault(); router.push('/settings'); setOpen(false); }
      }

      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [cycleTheme, router]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      // Small delay to ensure modal is rendered
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const filtered = NAV_COMMANDS.filter((cmd) => {
    const searchStr = (cmd.label + cmd.desc).toLowerCase();
    return searchStr.includes(query.toLowerCase());
  }).filter((cmd) => {
    // Basic feature check
    if (!business) return true;
    const features = business.features || [];
    if (cmd.href === '/pos' && !features.includes('caisse')) return false;
    if (cmd.href === '/livraison' && !features.includes('livraison')) return false;
    return true;
  });

  const handleSelect = (href: string) => {
    router.push(href);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter') {
      if (filtered[activeIndex]) {
        handleSelect(filtered[activeIndex].href);
      }
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />

      {/* Palette */}
      <div className="relative w-full max-w-xl bg-surface-card rounded-2xl shadow-2xl border border-surface-border overflow-hidden flex flex-col">
        <div className="flex items-center px-4 py-3 border-b border-surface-border bg-surface-input/50">
          <Search className="w-5 h-5 text-content-muted mr-3" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Rechercher une page ou une action... (Ctrl+K)"
            className="flex-1 bg-transparent border-none outline-none text-content-primary text-base placeholder:text-content-muted"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
            onKeyDown={onKeyDown}
          />
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-surface-card border border-surface-border">
            <span className="text-[10px] font-bold text-content-muted">ESC</span>
          </div>
        </div>

        <div className="max-h-[50vh] overflow-y-auto py-2">
          {filtered.length > 0 ? (
            filtered.map((cmd, idx) => {
              const Icon = cmd.icon;
              const active = idx === activeIndex;
              return (
                <button
                  key={cmd.href}
                  className={cn(
                    "w-full flex items-center gap-4 px-4 py-3 text-left transition-colors",
                    active ? "bg-brand-600 text-content-primary" : "text-content-secondary hover:bg-surface-hover hover:text-content-primary"
                  )}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => handleSelect(cmd.href)}
                >
                  <div className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                    active ? "bg-white/20" : "bg-surface-input"
                  )}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{cmd.label}</p>
                    <p className={cn("text-xs truncate", active ? "text-brand-100" : "text-content-muted")}>
                      {cmd.desc}
                    </p>
                  </div>
                  {active && <span className="text-[10px] font-bold opacity-60">ENTER</span>}
                </button>
              );
            })
          ) : (
            <div className="py-12 text-center text-content-muted">
              <Search className="w-8 h-8 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Aucun résultat pour &quot;{query}&quot;</p>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-surface-border bg-surface-input/30 flex items-center justify-between">
          <p className="text-[10px] text-content-muted uppercase tracking-widest font-semibold">
            Navigation Rapide
          </p>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-content-muted">Choisir</span>
              <kbd className="px-1.5 py-0.5 rounded bg-surface-card border border-surface-border text-[9px] text-content-secondary font-bold">↑↓</kbd>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-content-muted">Ouvrir</span>
              <kbd className="px-1.5 py-0.5 rounded bg-surface-card border border-surface-border text-[9px] text-content-secondary font-bold">↵</kbd>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
