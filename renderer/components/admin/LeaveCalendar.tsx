'use client';

import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LeaveRequest } from '@services/supabase/leave';

interface LeaveCalendarProps {
  year: number;
  month: number;
  requests: LeaveRequest[];
  onPrev: () => void;
  onNext: () => void;
}

export function LeaveCalendar({ year, month, requests, onPrev, onNext }: LeaveCalendarProps) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0 (Sun) to 6 (Sat)
  
  // Ajustement pour commencer par Lundi (1) au lieu de Dimanche (0)
  const startingDay = firstDay === 0 ? 6 : firstDay - 1;

  const days = useMemo(() => {
    const arr = [];
    // Jours vides au début
    for (let i = 0; i < startingDay; i++) arr.push(null);
    // Jours du mois
    for (let i = 1; i <= daysInMonth; i++) arr.push(i);
    return arr;
  }, [year, month, daysInMonth, startingDay]);

  const monthName = new Date(year, month - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  const getLeavesForDay = (day: number) => {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return requests.filter(r => 
      r.status === 'approved' && 
      dateStr >= r.start_date && 
      dateStr <= r.end_date
    );
  };

  return (
    <div className="bg-surface-card border border-surface-border rounded-3xl overflow-hidden shadow-sm">
      {/* Header Calendrier */}
      <div className="p-4 border-b border-surface-border flex items-center justify-between bg-surface-hover/30">
        <h3 className="text-sm font-bold text-content-primary capitalize">{monthName}</h3>
        <div className="flex gap-1">
          <button onClick={onPrev} className="p-2 hover:bg-surface-hover rounded-xl text-content-secondary transition-colors">
            <ChevronLeft size={18} />
          </button>
          <button onClick={onNext} className="p-2 hover:bg-surface-hover rounded-xl text-content-secondary transition-colors">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Grille */}
      <div className="grid grid-cols-7 bg-surface-border/20 gap-px">
        {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d => (
          <div key={d} className="bg-surface-card py-2 text-center text-[10px] font-black text-content-primary uppercase tracking-widest">
            {d}
          </div>
        ))}
        
        {days.map((day, i) => {
          const leaves = day ? getLeavesForDay(day) : [];
          return (
            <div key={i} className={cn(
              "min-h-[100px] bg-surface-card p-2 transition-colors",
              !day && "bg-surface-hover/20"
            )}>
              {day && (
                <>
                  <span className="text-xs font-bold text-content-primary">{day}</span>
                  <div className="mt-1 space-y-1">
                    {leaves.map(l => (
                      <div 
                        key={l.id} 
                        style={{ backgroundColor: `${l.leave_type?.color}20`, borderColor: `${l.leave_type?.color}40`, color: l.leave_type?.color }}
                        className="text-[9px] px-1.5 py-0.5 rounded border flex items-center gap-1 truncate font-bold"
                        title={`${l.staff?.name} - ${l.leave_type?.name}`}
                      >
                        <div className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: l.leave_type?.color }} />
                        {l.staff?.name}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


