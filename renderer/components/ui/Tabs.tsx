'use client';

import type { ComponentType } from 'react';
import { cn } from '@/lib/utils';

export interface TabDef<T extends string> {
  id: T;
  label: string;
  /** Icône lucide (composant) : `icon: Users`. */
  icon?: ComponentType<{ className?: string }>;
  /** Compteur affiché à droite du libellé (ex. nombre d'éléments). */
  count?: number;
}

export interface TabsProps<T extends string> {
  tabs: readonly TabDef<T>[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
}

/**
 * Barre d'onglets pilule standard (pattern des pages hôtel/contrats).
 * Purement présentationnelle : brancher `value`/`onChange` sur `useUrlTab`
 * pour des onglets portés par l'URL (CLAUDE.md › Navigation) :
 *
 *   const [tab, setTab] = useUrlTab<Tab>('liste', ['liste', 'config']);
 *   <Tabs tabs={TABS} value={tab} onChange={setTab} />
 *
 * Défile horizontalement sur petit écran, cibles tactiles confortables.
 */
export function Tabs<T extends string>({ tabs, value, onChange, className }: TabsProps<T>) {
  return (
    <div role="tablist" className={cn('flex gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar', className)}>
      {tabs.map(({ id, label, icon: Icon, count }) => {
        const active = id === value;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0',
              active ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/10' : 'btn-secondary',
            )}
          >
            {Icon && <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />}
            {label}
            {typeof count === 'number' && (
              <span
                className={cn(
                  'px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none',
                  active ? 'bg-white/20 text-white' : 'bg-surface-hover text-content-secondary',
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
