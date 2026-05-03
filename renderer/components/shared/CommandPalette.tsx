'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Search
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';
import { useThemeStore } from '@/store/theme';
import { NAV_ITEMS } from '@/lib/nav-config';
import { useCan } from '@/hooks/usePermission';
import type { PermissionKey } from '@/lib/permissions-map';

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const router = useRouter();
  const { cycle: cycleTheme } = useThemeStore();
  const can = useCan();
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

  const filtered = NAV_ITEMS.filter((item) => {
    // 1. Permission check
    if (item.permission && !can(item.permission as PermissionKey)) return false;
    
    // 2. Search query filter
    const searchStr = (item.label).toLowerCase();
    return searchStr.includes(query.toLowerCase());
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
