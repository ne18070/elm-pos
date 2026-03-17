'use client';

import { useCategories } from '@/hooks/useCategories';
import { cn } from '@/lib/utils';

interface CategoryBarProps {
  businessId: string;
  selected: string | null;
  onSelect: (id: string | null) => void;
}

export function CategoryBar({ businessId, selected, onSelect }: CategoryBarProps) {
  const { categories } = useCategories(businessId);

  return (
    <div className="flex gap-2 px-4 py-2 border-b border-surface-border overflow-x-auto scrollbar-none">
      <button
        onClick={() => onSelect(null)}
        className={cn(
          'px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors shrink-0',
          selected === null
            ? 'bg-brand-600 text-white'
            : 'bg-surface-input text-slate-400 hover:text-white'
        )}
      >
        Tout
      </button>
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat.id)}
          className={cn(
            'px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors shrink-0',
            selected === cat.id
              ? 'bg-brand-600 text-white'
              : 'bg-surface-input text-slate-400 hover:text-white'
          )}
          style={cat.color ? { borderLeft: `3px solid ${cat.color}` } : undefined}
        >
          {cat.name}
        </button>
      ))}
    </div>
  );
}
