'use client';

import { Square, Circle, Users, Clock } from 'lucide-react';
import type { RestaurantTable } from '@pos-types';
import { cn } from '@/lib/utils';

interface TableItemProps {
  table: RestaurantTable;
  onSelect: (table: RestaurantTable) => void;
  selected?: boolean;
  editMode?: boolean;
  onDragEnd?: (tableId: string, pos_x: number, pos_y: number) => void;
  containerRef?: React.RefObject<HTMLDivElement>;
}

export function TableItem({ table, onSelect, selected, editMode, onDragEnd, containerRef }: TableItemProps) {
  const isOccupied = table.status === 'occupied';
  const isCleaning = table.status === 'cleaning';

  const statusColors = {
    free:     'bg-slate-800/90 border-slate-600/60 hover:border-brand-400 text-slate-300',
    occupied: 'bg-sky-950/90 border-sky-500/70 text-sky-300',
    reserved: 'bg-amber-950/90 border-amber-500/70 text-amber-300',
    cleaning: 'bg-indigo-950/90 border-indigo-500/50 text-indigo-300',
  };

  const statusGlow = {
    free:     '',
    occupied: '0 0 16px rgba(14,165,233,0.35)',
    reserved: '0 0 16px rgba(245,158,11,0.25)',
    cleaning: '0 0 12px rgba(99,102,241,0.2)',
  };

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (!editMode || !onDragEnd || !containerRef?.current) return;
    e.preventDefault();
    const el = e.currentTarget;
    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const startPx = table.pos_x;
    const startPy = table.pos_y;

    el.setPointerCapture(e.pointerId);

    function onMove(me: PointerEvent) {
      const dx = me.clientX - startX;
      const dy = me.clientY - startY;
      const newX = Math.max(0, Math.min(90, startPx + (dx / rect.width) * 100));
      const newY = Math.max(0, Math.min(85, startPy + (dy / rect.height) * 100));
      el.style.left = `${newX}%`;
      el.style.top  = `${newY}%`;
    }

    function onUp(ue: PointerEvent) {
      const dx = ue.clientX - startX;
      const dy = ue.clientY - startY;
      const newX = Math.max(0, Math.min(90, startPx + (dx / rect.width) * 100));
      const newY = Math.max(0, Math.min(85, startPy + (dy / rect.height) * 100));
      onDragEnd?.(table.id, Math.round(newX), Math.round(newY));
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
    }

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  }

  return (
    <button
      onPointerDown={handlePointerDown}
      onClick={() => !editMode && onSelect(table)}
      style={{
        left:      `${table.pos_x}%`,
        top:       `${table.pos_y}%`,
        width:     `${table.width}px`,
        height:    `${table.height}px`,
        transform: `rotate(${table.rotation}deg)`,
        cursor:    editMode ? 'grab' : 'pointer',
        boxShadow: selected
          ? '0 0 0 2px #fff, 0 0 20px rgba(56,189,248,0.5)'
          : statusGlow[table.status],
        backdropFilter: 'blur(4px)',
      }}
      className={cn(
        "absolute flex flex-col items-center justify-center rounded-2xl border-2 transition-all group select-none",
        statusColors[table.status],
        editMode && "border-dashed opacity-75"
      )}
    >
      {/* Icône de forme en filigrane */}
      {table.shape === 'round'
        ? <Circle className="absolute w-10 h-10 opacity-[0.07]" />
        : <Square  className="absolute w-10 h-10 opacity-[0.07]" />}

      <span className="text-[13px] font-bold z-10 leading-tight text-center px-1 truncate w-full">
        {table.name}
      </span>

      <div className="flex items-center gap-1 mt-0.5 z-10 opacity-50">
        <Users className="w-2.5 h-2.5" />
        <span className="text-[9px] font-semibold">{table.capacity}</span>
      </div>

      {isOccupied && !editMode && (
        <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-brand-500 border-2 border-slate-950 animate-pulse" />
      )}
      {isCleaning && !editMode && (
        <Clock className="absolute -top-1.5 -right-1.5 w-4 h-4 text-indigo-400 bg-surface-overlay rounded-full" />
      )}
    </button>
  );
}
