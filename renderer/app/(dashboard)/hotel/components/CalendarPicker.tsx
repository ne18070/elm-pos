'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { todayStr, fmt } from './hotel-helpers';

const WEEK_DAYS  = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];
const MONTH_NAMES = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre',
];

export interface BookedRange { from: string; to: string }

interface Props {
  checkIn:      string;
  checkOut:     string;
  onSelect:     (ci: string, co: string) => void;
  bookedRanges?: BookedRange[];
}

export function CalendarPicker({ checkIn, checkOut, onSelect, bookedRanges = [] }: Props) {
  const initDate = checkIn ? new Date(checkIn + 'T12:00:00') : new Date();
  const [year,  setYear]  = useState(initDate.getFullYear());
  const [month, setMonth] = useState(initDate.getMonth());
  const [hover, setHover] = useState<string | null>(null);
  const today = todayStr();

  function ds(y: number, m: number, d: number): string {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  function prevMonth() {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }
  function handleClick(d: string) {
    if (!checkIn || (checkIn && checkOut)) { onSelect(d, ''); }
    else if (d > checkIn)  { onSelect(checkIn, d); }
    else if (d < checkIn)  { onSelect(d, checkIn); }
    else                    { onSelect('', ''); }
  }
  function inRange(d: string): boolean {
    const end = checkOut || hover;
    if (!checkIn || !end) return false;
    const [s, e] = checkIn < end ? [checkIn, end] : [end, checkIn];
    return d > s && d < e;
  }
  function isBooked(d: string): boolean {
    return bookedRanges.some((r) => d >= r.from && d < r.to);
  }

  const daysInMonth  = new Date(year, month + 1, 0).getDate();
  const firstWeekDay = new Date(year, month, 1).getDay();
  const startOffset  = (firstWeekDay + 6) % 7;
  const totalCells   = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  return (
    <div className="rounded-xl border border-surface-border bg-surface-input p-3 select-none">
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="p-1 rounded-lg hover:bg-surface-hover text-content-secondary hover:text-content-primary">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-content-primary">{MONTH_NAMES[month]} {year}</span>
        <button onClick={nextMonth} className="p-1 rounded-lg hover:bg-surface-hover text-content-secondary hover:text-content-primary">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {WEEK_DAYS.map((d) => (
          <div key={d} className="text-center text-xs text-content-primary font-medium py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {Array.from({ length: totalCells }, (_, i) => {
          const dayNum = i - startOffset + 1;
          if (dayNum < 1 || dayNum > daysInMonth) return <div key={i} />;
          const d       = ds(year, month, dayNum);
          const start   = d === checkIn;
          const end     = d === checkOut;
          const range   = inRange(d);
          const booked  = isBooked(d);
          const isToday = d === today;
          const past    = d < today;
          return (
            <div
              key={i}
              onMouseEnter={() => checkIn && !checkOut && setHover(d)}
              onMouseLeave={() => setHover(null)}
              onClick={() => !past && handleClick(d)}
              className={cn(
                'relative h-8 flex items-center justify-center text-xs font-medium transition-colors',
                past ? 'text-content-muted cursor-default' : 'cursor-pointer',
                range && !start && !end ? 'bg-badge-brand text-content-primary' : '',
                start ? 'rounded-l-full bg-brand-600 text-content-primary' : '',
                end   ? 'rounded-r-full bg-brand-600 text-content-primary' : '',
                booked && !start && !end ? 'text-status-error' : '',
                isToday && !start && !end ? 'font-bold' : '',
                !start && !end && !range && !past ? 'hover:bg-surface-hover rounded-full' : '',
              )}
            >
              {isToday && !start && !end && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand-400" />
              )}
              {booked && !start && !end && (
                <span className="absolute top-1 right-1 w-1 h-1 rounded-full bg-red-500" />
              )}
              {dayNum}
            </div>
          );
        })}
      </div>

      {(checkIn || checkOut) && (
        <div className="mt-3 pt-3 border-t border-surface-border flex items-center justify-between text-xs text-content-secondary">
          <span>
            {checkIn ? fmt(checkIn) : '—'} —{checkOut ? fmt(checkOut) : <span className="text-status-warning italic">choisir départ</span>}
          </span>
          <button onClick={() => onSelect('', '')} className="text-content-primary hover:text-status-error ml-2">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
      {!checkIn && <p className="mt-2 text-xs text-content-primary text-center">Cliquez sur la date d&apos;arrivée</p>}
      {checkIn && !checkOut && <p className="mt-2 text-xs text-status-warning text-center">Cliquez sur la date de départ</p>}
    </div>
  );
}


