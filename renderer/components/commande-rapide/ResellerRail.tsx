'use client';

import { useMemo, useState } from 'react';
import { Search, ChevronRight, Crown } from 'lucide-react';
import type { Reseller, ResellerType } from '@services/supabase/resellers';
import { RESELLER_TYPE_LABELS as TYPE_LABELS, RESELLER_TYPE_BADGE as TYPE_COLORS } from '@/lib/reseller-format';
import { cn } from '@/lib/utils';

interface Props {
  resellers: Reseller[];
  selectedId: string | null;
  onSelect: (r: Reseller) => void;
  loading: boolean;
  draftResellerIds: string[];
}

export function ResellerRail({ resellers, selectedId, onSelect, loading, draftResellerIds }: Props) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<ResellerType | ''>('');

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return resellers
      .filter((r) => r.is_active)
      .filter((r) => {
        const okType = !typeFilter || r.type === typeFilter;
        const okText =
          !q ||
          r.name.toLowerCase().includes(q) ||
          (r.phone ?? '').includes(q) ||
          (r.zone ?? '').toLowerCase().includes(q);
        return okType && okText;
      });
  }, [resellers, search, typeFilter]);

  const drafts = new Set(draftResellerIds);

  return (
    <div className="w-60 shrink-0 border-r border-surface-border flex flex-col">
      <div className="p-3 border-b border-surface-border space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-muted" />
          <input
            className="input pl-8 h-8 text-sm"
            placeholder="Chercher un revendeur"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input h-7 text-xs w-full py-0"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as ResellerType | '')}
        >
          <option value="">Tous les types</option>
          {(Object.keys(TYPE_LABELS) as ResellerType[]).map((t) => (
            <option key={t} value={t}>{TYPE_LABELS[t]}</option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {loading && <p className="text-center text-content-muted text-sm py-8">Chargement</p>}

        {!loading && list.length === 0 && (
          <p className="text-center text-content-muted text-sm py-8">Aucun revendeur</p>
        )}

        {list.map((r) => {
          const active = selectedId === r.id;
          return (
            <button
              key={r.id}
              onClick={() => onSelect(r)}
              className={cn(
                'w-full text-left px-3 py-2.5 border-b border-surface-border flex items-center gap-2.5 transition-colors',
                active ? 'bg-badge-brand' : 'hover:bg-surface-hover',
              )}
            >
              <div
                className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm font-bold',
                  active ? 'bg-brand-600 text-white' : 'bg-surface-input text-content-brand',
                )}
              >
                {r.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-content-primary truncate flex items-center gap-1">
                  {r.name}
                  {r.chef_id && <Crown className="w-3 h-3 text-status-warning shrink-0" />}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded border', TYPE_COLORS[r.type ?? 'gros'])}>
                    {TYPE_LABELS[r.type ?? 'gros']}
                  </span>
                  {r.zone && <span className="text-[9px] text-content-muted truncate">{r.zone}</span>}
                </div>
              </div>
              {drafts.has(r.id) && !active && (
                <span className="w-1.5 h-1.5 rounded-full bg-status-warning shrink-0" title="Brouillon en cours" />
              )}
              <ChevronRight className="w-3.5 h-3.5 text-content-muted shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
