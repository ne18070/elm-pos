'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Check, ChevronDown, X } from 'lucide-react';
import type { ResellerClient } from '@services/supabase/resellers';
import { cn } from '@/lib/utils';

interface Props {
  clients: ResellerClient[];
  value: string | null;
  onChange: (id: string | null) => void;
}

export function ClientPicker({ clients, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = clients.find((c) => c.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(''); }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q),
    );
  }, [clients, search]);

  function pick(id: string | null) {
    onChange(id);
    setOpen(false);
    setSearch('');
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="input h-9 text-sm w-full flex items-center justify-between gap-2 text-left"
      >
        <span className={cn('truncate', !selected && 'text-content-muted')}>
          {selected ? selected.name : 'Sans client'}
        </span>
        <ChevronDown className={cn('w-3.5 h-3.5 text-content-muted shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-surface-card border border-surface-border rounded-xl shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-surface-border relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-muted pointer-events-none" />
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setOpen(false); setSearch(''); }
                else if (e.key === 'Enter') { e.preventDefault(); if (filtered[0]) pick(filtered[0].id); }
              }}
              placeholder="Rechercher un client"
              className="input pl-8 h-8 text-sm"
            />
          </div>
          <div className="max-h-56 overflow-y-auto custom-scrollbar">
            <button
              type="button"
              onClick={() => pick(null)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors',
                !value ? 'bg-badge-brand text-content-brand' : 'hover:bg-surface-hover text-content-secondary',
              )}
            >
              <X className="w-3.5 h-3.5 shrink-0" /> Sans client
            </button>
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => pick(c.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-left transition-colors',
                  c.id === value ? 'bg-badge-brand' : 'hover:bg-surface-hover',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm truncate', c.id === value ? 'text-content-brand font-medium' : 'text-content-primary')}>
                    {c.name}
                  </p>
                  {c.phone && <p className="text-[10px] text-content-muted truncate">{c.phone}</p>}
                </div>
                {c.id === value && <Check className="w-4 h-4 text-content-brand shrink-0" />}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-3 text-xs text-content-muted text-center">Aucun client</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
