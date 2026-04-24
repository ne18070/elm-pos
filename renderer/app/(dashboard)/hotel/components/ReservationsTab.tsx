'use client';

import { Search, Calendar, ChevronRight, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HotelReservation } from '@services/supabase/hotel';
import { CalendarPicker } from './CalendarPicker';
import { ResFilter, fmt, fmtMoney, resStatusStyle, resStatusLabel } from './hotel-helpers';
import { nightsBetween } from '@services/supabase/hotel';

interface Props {
  filteredReservations: HotelReservation[];
  resFilter:            ResFilter;
  search:               string;
  today:                string;
  dateFilterFrom:       string;
  dateFilterTo:         string;
  showDateCal:          boolean;
  loading:              boolean;
  currency:             string;
  onFilterChange:       (f: ResFilter) => void;
  onToggleDateCal:      () => void;
  onDateSelect:         (from: string, to: string) => void;
  onSearchChange:       (v: string) => void;
  openDetail:           (res: HotelReservation) => void;
}

export function ReservationsTab({
  filteredReservations, resFilter, search, today, dateFilterFrom, dateFilterTo,
  showDateCal, loading, currency,
  onFilterChange, onToggleDateCal, onDateSelect, onSearchChange, openDetail,
}: Props) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-3 border-b border-surface-border space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1.5 flex-wrap">
            {([
              { value: 'active', label: 'En cours' },
              { value: 'today',  label: "Aujourd'hui" },
              { value: 'all',    label: 'Toutes' },
            ] as { value: ResFilter; label: string }[]).map(({ value, label }) => (
              <button
                key={value}
                onClick={() => onFilterChange(value)}
                className={cn('px-3 py-1.5 rounded-xl text-sm transition-colors', resFilter === value ? 'bg-brand-600 text-white' : 'btn-secondary')}
              >
                {label}
              </button>
            ))}
            <button
              onClick={onToggleDateCal}
              className={cn('px-3 py-1.5 rounded-xl text-sm transition-colors flex items-center gap-1.5', resFilter === 'dates' ? 'bg-brand-600 text-white' : 'btn-secondary')}
            >
              <Calendar className="w-3.5 h-3.5" />
              {resFilter === 'dates' && dateFilterFrom
                ? `${fmt(dateFilterFrom)}${dateFilterTo ? ` → ${fmt(dateFilterTo)}` : ''}`
                : 'Par dates'}
            </button>
          </div>
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              className="input pl-8 h-9 text-sm"
              placeholder="Chercher client, chambre…"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        </div>
        {resFilter === 'dates' && showDateCal && (
          <div className="pb-1">
            <CalendarPicker checkIn={dateFilterFrom} checkOut={dateFilterTo} onSelect={onDateSelect} />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading && <p className="text-center text-slate-500 py-16">Chargement…</p>}
        {!loading && filteredReservations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
            <ClipboardList className="w-12 h-12 opacity-20" />
            <p>Aucune réservation</p>
          </div>
        )}
        <div className="space-y-2 max-w-3xl">
          {filteredReservations.map((res) => {
            const nights = nightsBetween(res.check_in, res.check_out);
            const arrivesToday = res.check_in === today;
            const departsToday = res.check_out === today;
            return (
              <button
                key={res.id}
                onClick={() => openDetail(res)}
                className="w-full card p-4 flex items-center gap-4 hover:bg-surface-hover text-left transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-surface-input flex items-center justify-center shrink-0 text-sm font-bold text-content-brand">
                  {res.guest?.full_name.charAt(0).toUpperCase() ?? '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-white truncate">{res.guest?.full_name}</p>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', resStatusStyle(res.status))}>
                      {resStatusLabel(res.status)}
                    </span>
                    {arrivesToday && res.status === 'confirmed' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-badge-success text-status-success border border-status-success">Arrivée</span>
                    )}
                    {departsToday && res.status === 'checked_in' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-badge-warning text-status-warning border border-status-warning">Départ</span>
                    )}
                  </div>
                  <p className="text-xs text-content-secondary mt-0.5">
                    Chambre {res.room?.number} · {nights} nuit{nights > 1 ? 's' : ''} · {fmt(res.check_in)} → {fmt(res.check_out)}
                  </p>
                </div>
                <div className="text-right shrink-0 hidden sm:block">
                  <p className="text-sm font-semibold text-white">{fmtMoney(res.total, currency)}</p>
                  {res.paid_amount < res.total && res.status !== 'cancelled' && (
                    <p className="text-xs text-status-warning">Reste {fmtMoney(res.total - res.paid_amount, currency)}</p>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
