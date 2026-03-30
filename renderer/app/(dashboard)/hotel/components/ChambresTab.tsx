'use client';

import { Search, BedDouble, Users, Pencil, LogIn, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HotelRoom, HotelReservation } from '@services/supabase/hotel';
import { ROOM_TYPES, fmt, fmtMoney, roomStatusLabel } from './hotel-helpers';

interface Stats { available: number; occupied: number; cleaning: number; maintenance: number; total: number }

interface Props {
  filteredRooms:      HotelRoom[];
  stats:              Stats;
  search:             string;
  loading:            boolean;
  isManagerOrAbove:   boolean;
  currency:           string;
  onSearchChange:     (v: string) => void;
  openRoomPanel:      (item: HotelRoom | null) => void;
  openReservationPanel: (roomId?: string) => void;
  openDetail:         (res: HotelReservation) => void;
  activeResForRoom:   (roomId: string) => HotelReservation | undefined;
  confirmedResForRoom:(roomId: string) => HotelReservation | undefined;
  onMarkAvailable:    (roomId: string) => void;
}

export function ChambresTab({
  filteredRooms, stats, search, loading, isManagerOrAbove, currency,
  onSearchChange, openRoomPanel, openReservationPanel, openDetail,
  activeResForRoom, confirmedResForRoom, onMarkAvailable,
}: Props) {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            className="input pl-8 h-9 text-sm"
            placeholder="Chercher par numéro, étage…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        <div className="hidden sm:flex gap-2">
          {[
            { label: 'Disponibles', count: stats.available,   dot: 'bg-emerald-400', num: 'text-emerald-400' },
            { label: 'Occupées',    count: stats.occupied,    dot: 'bg-brand-400',   num: 'text-brand-400'   },
            { label: 'Nettoyage',   count: stats.cleaning,    dot: 'bg-amber-400',   num: 'text-amber-400'   },
            { label: 'Maintenance', count: stats.maintenance, dot: 'bg-slate-400',   num: 'text-slate-400'   },
          ].map(({ label, count, dot, num }) => (
            <div key={label} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-card border border-surface-border">
              <span className={cn('w-2 h-2 rounded-full shrink-0', dot)} />
              <span className={cn('text-base font-bold', num)}>{count}</span>
              <span className="text-xs text-slate-500">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {loading && <p className="text-center text-slate-500 py-16">Chargement…</p>}

      {!loading && filteredRooms.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
          <BedDouble className="w-12 h-12 opacity-20" />
          <p>Aucune chambre</p>
          {isManagerOrAbove && (
            <button onClick={() => openRoomPanel(null)} className="btn-primary h-9 text-sm">Ajouter une chambre</button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {filteredRooms.map((room) => {
          const activeRes    = activeResForRoom(room.id);
          const confirmedRes = confirmedResForRoom(room.id);
          const accent = {
            available:   'bg-gradient-to-r from-emerald-500 to-green-400',
            occupied:    'bg-gradient-to-r from-brand-500 to-violet-500',
            cleaning:    'bg-gradient-to-r from-amber-500 to-yellow-400',
            maintenance: 'bg-gradient-to-r from-slate-500 to-slate-400',
          }[room.status];
          const dot = {
            available:   'bg-emerald-400',
            occupied:    'bg-brand-400',
            cleaning:    'bg-amber-400',
            maintenance: 'bg-slate-400',
          }[room.status];

          return (
            <div
              key={room.id}
              className="group relative rounded-2xl bg-surface-card border border-surface-border overflow-hidden
                         cursor-pointer hover:border-white/20 hover:shadow-xl hover:-translate-y-0.5
                         transition-all duration-200 flex flex-col"
              onClick={() => {
                if (activeRes)         openDetail(activeRes);
                else if (confirmedRes) openDetail(confirmedRes);
                else if (room.status === 'available') openReservationPanel(room.id);
                else if (isManagerOrAbove)            openRoomPanel(room);
              }}
            >
              <div className={cn('h-1.5 w-full', accent)} />
              <div className="p-4 flex flex-col gap-3 flex-1">
                <div className="flex items-start justify-between gap-1">
                  <div>
                    <p className="text-3xl font-black text-white leading-none tracking-tight">{room.number}</p>
                    {room.floor && <p className="text-[11px] text-slate-500 mt-0.5">{room.floor}</p>}
                  </div>
                  {isManagerOrAbove && (
                    <button
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-xl bg-surface-hover text-slate-400 hover:text-white transition-all shrink-0"
                      onClick={(e) => { e.stopPropagation(); openRoomPanel(room); }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface-input text-slate-300 font-medium">
                    {ROOM_TYPES.find((t) => t.value === room.type)?.label}
                  </span>
                  <span className="text-[11px] text-slate-500 flex items-center gap-0.5">
                    <Users className="w-3 h-3" /> {room.capacity}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={cn('w-2 h-2 rounded-full shrink-0', dot)} />
                  <span className="text-xs font-semibold text-slate-300">{roomStatusLabel(room.status)}</span>
                </div>
                {activeRes && (
                  <div className="rounded-xl bg-brand-900/40 border border-brand-800/60 p-2.5 space-y-0.5">
                    <p className="text-xs font-bold text-white truncate">{activeRes.guest?.full_name}</p>
                    <p className="text-[11px] text-brand-300 flex items-center gap-1">
                      <LogOut className="w-3 h-3 shrink-0" /> Départ {fmt(activeRes.check_out)}
                    </p>
                  </div>
                )}
                {!activeRes && confirmedRes && (
                  <div className="rounded-xl bg-amber-900/20 border border-amber-700/40 p-2.5 space-y-0.5">
                    <p className="text-[11px] font-bold text-amber-300 uppercase tracking-wide">Réservée</p>
                    <p className="text-xs text-white font-medium truncate">{confirmedRes.guest?.full_name}</p>
                    <p className="text-[11px] text-amber-400/80">{fmt(confirmedRes.check_in)} → {fmt(confirmedRes.check_out)}</p>
                  </div>
                )}
                {(room.amenities?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1 mt-auto">
                    {room.amenities.slice(0, 3).map((a) => (
                      <span key={a} className="text-[10px] px-1.5 py-0.5 rounded-md bg-surface-input text-slate-400">{a}</span>
                    ))}
                    {room.amenities.length > 3 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-surface-input text-slate-500">+{room.amenities.length - 3}</span>
                    )}
                  </div>
                )}
                <div className="border-t border-surface-border pt-3 flex items-baseline justify-between mt-auto">
                  <span className="text-sm font-bold text-white">{fmtMoney(room.price_per_night, currency)}</span>
                  <span className="text-[11px] text-slate-500">/nuit</span>
                </div>
                {room.status === 'available' && !confirmedRes && (
                  <div className="text-xs text-center py-1.5 rounded-xl bg-emerald-700/20 border border-emerald-700/40 text-emerald-400 font-semibold tracking-wide">
                    + Réserver
                  </div>
                )}
                {(room.status === 'cleaning' || room.status === 'maintenance') && (
                  <button
                    className="text-xs py-1.5 rounded-xl border border-surface-border hover:border-white/20 text-slate-400 hover:text-white transition-colors"
                    onClick={(e) => { e.stopPropagation(); onMarkAvailable(room.id); }}
                  >
                    Marquer disponible
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
