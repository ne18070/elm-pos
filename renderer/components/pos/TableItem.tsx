'use client';

import { Square, Circle, Users, Clock } from 'lucide-react';
import type { RestaurantTable } from '@pos-types';
import { cn } from '@/lib/utils';

interface TableItemProps {
  table: RestaurantTable;
  onSelect: (table: RestaurantTable) => void;
  selected?: boolean;
}

export function TableItem({ table, onSelect, selected }: TableItemProps) {
  const isOccupied = table.status === 'occupied';
  const isCleaning = table.status === 'cleaning';
  const isReserved = table.status === 'reserved';

  const statusColors = {
    free:     'bg-surface-card border-surface-border hover:border-brand-500 text-content-secondary',
    occupied: 'bg-badge-brand border-brand-700 text-content-brand',
    reserved: 'bg-badge-warning border-status-warning text-status-warning',
    cleaning: 'bg-indigo-900/20 border-indigo-700 text-indigo-400',
  };

  return (
    <button
      onClick={() => onSelect(table)}
      style={{
        left:   `${table.pos_x}%`,
        top:    `${table.pos_y}%`,
        width:  `${table.width}px`,
        height: `${table.height}px`,
        transform: `rotate(${table.rotation}deg)`,
      }}
      className={cn(
        "absolute flex flex-col items-center justify-center rounded-xl border-2 transition-all group shadow-lg",
        statusColors[table.status],
        selected && "ring-2 ring-white ring-offset-2 ring-offset-slate-950 border-white"
      )}
    >
      {/* Shape Icon */}
      {table.shape === 'round' ? (
        <Circle className="w-6 h-6 mb-1 opacity-20 absolute" />
      ) : (
        <Square className="w-6 h-6 mb-1 opacity-20 absolute" />
      )}

      <span className="text-sm font-bold z-10">{table.name}</span>
      
      <div className="flex items-center gap-1 mt-0.5 z-10 opacity-60">
        <Users className="w-3 h-3" />
        <span className="text-[10px] font-medium">{table.capacity}</span>
      </div>

      {isOccupied && (
        <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-brand-500 border-2 border-slate-950 animate-pulse" />
      )}
      
      {isCleaning && (
        <Clock className="absolute -top-1.5 -right-1.5 w-4 h-4 text-indigo-400 bg-surface-overlay rounded-full" />
      )}
    </button>
  );
}
