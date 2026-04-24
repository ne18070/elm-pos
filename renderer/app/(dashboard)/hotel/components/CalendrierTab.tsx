'use client';

import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HotelRoom, HotelReservation } from '@services/supabase/hotel';
import { todayStr } from './hotel-helpers';

interface Props {
  rooms:        HotelRoom[];
  reservations: HotelReservation[];
  calYear:      number;
  calMonth:     number;
  loading:      boolean;
  today2:       Date;
  setCalYear:   (y: number) => void;
  setCalMonth:  (m: number | ((prev: number) => number)) => void;
  openDetail:   (res: HotelReservation) => void;
}

export function CalendrierTab({ rooms, reservations, calYear, calMonth, loading, today2, setCalYear, setCalMonth, openDetail }: Props) {
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const days        = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const monthLabel  = new Date(calYear, calMonth, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const todayFull   = todayStr();

  function prevMonth() {
    if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); }
    else setCalMonth((m) => m - 1);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); }
    else setCalMonth((m) => m + 1);
  }
  function dayStr(d: number) {
    return `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  function resOverlapsDay(res: HotelReservation, d: number): boolean {
    const ds = dayStr(d);
    return ds >= res.check_in && ds < res.check_out;
  }
  function resStartsOnDay(res: HotelReservation, d: number): boolean {
    return res.check_in === dayStr(d);
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <button onClick={prevMonth} className="p-1.5 rounded-lg btn-secondary shrink-0">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h2 className="font-semibold text-white capitalize flex-1 text-center min-w-32">{monthLabel}</h2>
        <button onClick={nextMonth} className="p-1.5 rounded-lg btn-secondary shrink-0">
          <ChevronRight className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-44">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
            <input
              type="date"
              className="input pl-8 h-9 text-sm w-full"
              title="Aller à une date"
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                const d = new Date(v + 'T12:00:00');
                setCalYear(d.getFullYear());
                setCalMonth(d.getMonth());
              }}
            />
          </div>
          <button
            onClick={() => { setCalYear(today2.getFullYear()); setCalMonth(today2.getMonth()); }}
            className="btn-secondary h-9 px-3 text-sm shrink-0"
          >
            Aujourd&apos;hui
          </button>
        </div>
      </div>

      {loading && <p className="text-center text-slate-500 py-16">Chargement…</p>}

      {!loading && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs" style={{ minWidth: `${daysInMonth * 36 + 80}px` }}>
            <thead>
              <tr>
                <th className="text-left py-2 pr-3 text-content-secondary font-medium w-20 sticky left-0 bg-surface z-10">Chambre</th>
                {days.map((d) => {
                  const ds = dayStr(d);
                  const isToday = ds === todayFull;
                  return (
                    <th key={d} className={cn('text-center w-9 py-2 font-medium', isToday ? 'text-content-brand' : 'text-slate-500')}>
                      {d}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => {
                const roomRes = reservations.filter((r) =>
                  r.room_id === room.id &&
                  r.status !== 'cancelled' &&
                  r.check_in < `${calYear}-${String(calMonth + 1).padStart(2, '0')}-32` &&
                  r.check_out > `${calYear}-${String(calMonth + 1).padStart(2, '0')}-00`
                );
                return (
                  <tr key={room.id} className="border-t border-surface-border">
                    <td className="py-1 pr-3 text-slate-300 font-semibold sticky left-0 bg-surface z-10">
                      {room.number}
                    </td>
                    {days.map((d) => {
                      const activeR = roomRes.find((r) => resOverlapsDay(r, d));
                      const isStart = activeR ? resStartsOnDay(activeR, d) : false;
                      const isToday = dayStr(d) === todayFull;
                      return (
                        <td
                          key={d}
                          className={cn('h-8 relative', isToday && !activeR ? 'bg-badge-brand' : '')}
                          onClick={() => activeR && openDetail(activeR)}
                        >
                          {activeR && (
                            <div className={cn(
                              'absolute inset-y-1 inset-x-0 cursor-pointer',
                              activeR.status === 'checked_in'  ? 'bg-brand-600/80' :
                              activeR.status === 'confirmed'   ? 'bg-amber-600/60' :
                              activeR.status === 'checked_out' ? 'bg-badge-success' :
                              'bg-slate-700/40',
                              isStart ? 'rounded-l-md ml-1' : ''
                            )}>
                              {isStart && (
                                <span className="absolute inset-0 flex items-center px-1 truncate text-white font-medium" style={{ fontSize: 10 }}>
                                  {activeR.guest?.full_name.split(' ')[0]}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex gap-4 mt-4 text-xs text-content-secondary">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-600/60 inline-block" />Confirmée</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-brand-600/80 inline-block" />En cours</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-badge-success border border-status-success inline-block" />Terminée</span>
          </div>
        </div>
      )}
    </div>
  );
}
