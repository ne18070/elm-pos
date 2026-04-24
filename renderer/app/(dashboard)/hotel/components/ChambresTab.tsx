import { Search, BedDouble, Users, Pencil, LogIn, LogOut, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMemo } from 'react';
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
  const roomsByFloor = useMemo(() => {
    const grouped: Record<string, HotelRoom[]> = {};
    filteredRooms.forEach(room => {
      const floor = room.floor?.trim() || 'Rez-de-chaussée';
      if (!grouped[floor]) grouped[floor] = [];
      grouped[floor].push(room);
    });
    
    return Object.entries(grouped).sort((a, b) => {
      const fa = a[0].toLowerCase();
      const fb = b[0].toLowerCase();
      const isGroundA = fa.includes('rez') || fa === 'rdc' || fa === '0';
      const isGroundB = fb.includes('rez') || fb === 'rdc' || fb === '0';
      if (isGroundA) return -1;
      if (isGroundB) return 1;
      return fa.localeCompare(fb, undefined, { numeric: true });
    });
  }, [filteredRooms]);

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="flex items-center gap-3 mb-8 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-primary" />
          <input
            className="input pl-8 h-10 text-sm bg-surface-input/50 focus:bg-surface-input"
            placeholder="Chercher par numéro, étage, type…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {[
            { label: 'Dispo', count: stats.available,   dot: 'bg-emerald-400', num: 'text-status-success' },
            { label: 'Occupées',    count: stats.occupied,    dot: 'bg-brand-400',   num: 'text-content-brand'   },
            { label: 'Nettoyage',   count: stats.cleaning,    dot: 'bg-amber-400',   num: 'text-status-warning'   },
            { label: 'Maintenance', count: stats.maintenance, dot: 'bg-slate-400',   num: 'text-content-secondary'   },
          ].map(({ label, count, dot, num }) => (
            <div key={label} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-card border border-surface-border whitespace-nowrap shadow-sm">
              <span className={cn('w-2 h-2 rounded-full shrink-0', dot)} />
              <span className={cn('text-sm font-bold', num)}>{count}</span>
              <span className="text-[10px] uppercase font-black tracking-widest text-content-primary">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {loading && <p className="text-center text-content-primary py-16">Chargement…</p>}

      {!loading && filteredRooms.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-content-primary gap-3">
          <BedDouble className="w-12 h-12 opacity-20" />
          <p>Aucune chambre trouvée</p>
          {isManagerOrAbove && (
            <button onClick={() => openRoomPanel(null)} className="btn-primary h-9 text-sm">Ajouter une chambre</button>
          )}
        </div>
      )}

      <div className="space-y-12">
        {roomsByFloor.map(([floor, rooms]) => (
          <section key={floor} className="relative pl-6 sm:pl-8">
            {/* Architecture indicator (vertical line) */}
            <div className="absolute left-0 top-2 bottom-0 w-1 bg-gradient-to-b from-brand-500/50 to-transparent rounded-full opacity-30" />
            
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-brand-500/10 text-content-brand border border-brand-500/20">
                <Layers className="w-4 h-4" />
              </div>
              <h2 className="text-lg font-black text-content-primary tracking-tight uppercase">
                {floor}
                <span className="ml-3 text-xs font-bold text-content-primary normal-case tracking-normal">
                  {rooms.length} chambre{rooms.length > 1 ? 's' : ''}
                </span>
              </h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
              {rooms.map((room) => {
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
                    className="group relative rounded-3xl bg-surface-card border border-surface-border overflow-hidden
                               cursor-pointer hover:border-brand-500/50 hover:shadow-2xl hover:-translate-y-1
                               transition-all duration-300 flex flex-col shadow-sm"
                    onClick={() => {
                      if (activeRes)         openDetail(activeRes);
                      else if (confirmedRes) openDetail(confirmedRes);
                      else if (room.status === 'available') openReservationPanel(room.id);
                      else if (isManagerOrAbove)            openRoomPanel(room);
                    }}
                  >
                    <div className={cn('h-1.5 w-full opacity-80', accent)} />
                    <div className="p-5 flex flex-col gap-4 flex-1 relative">
                      {/* Background room number for aesthetic */}
                      <span className="absolute top-4 right-4 text-5xl font-black text-content-primary/10 select-none pointer-events-none group-hover:text-brand-500/10 transition-colors">
                        {room.number}
                      </span>

                      <div className="flex items-start justify-between gap-1 relative z-10">
                        <div>
                          <p className="text-3xl font-black text-content-primary leading-none tracking-tighter">{room.number}</p>
                          <p className="text-[10px] font-black uppercase tracking-widest text-content-brand/80 mt-1.5">
                            {ROOM_TYPES.find((t) => t.value === room.type)?.label}
                          </p>
                        </div>
                        {isManagerOrAbove && (
                          <button
                            className="opacity-0 group-hover:opacity-100 p-2 rounded-xl bg-surface-hover text-content-secondary hover:text-content-primary transition-all shrink-0 shadow-lg"
                            onClick={(e) => { e.stopPropagation(); openRoomPanel(room); }}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-3 relative z-10">
                        <div className="flex items-center gap-1.5 py-1 px-2.5 rounded-lg bg-surface-input/50 border border-surface-border/50">
                          <span className={cn('w-2 h-2 rounded-full shrink-0 animate-pulse', dot)} />
                          <span className="text-[10px] font-bold uppercase tracking-wide text-content-primary">{roomStatusLabel(room.status)}</span>
                        </div>
                        <span className="text-[10px] font-bold text-content-primary flex items-center gap-1">
                          <Users className="w-3 h-3" /> {room.capacity} pers.
                        </span>
                      </div>

                      <div className="space-y-3 relative z-10 flex-1 flex flex-col">
                        {activeRes && (
                          <div className="rounded-2xl bg-brand-600/10 border border-brand-500/20 p-3 space-y-1 shadow-inner">
                            <p className="text-xs font-black text-content-primary truncate">{activeRes.guest?.full_name}</p>
                            <p className="text-[10px] font-bold text-content-brand flex items-center gap-1 uppercase tracking-tighter">
                              <LogOut className="w-3 h-3 shrink-0" /> Sortie {fmt(activeRes.check_out)}
                            </p>
                          </div>
                        )}
                        {!activeRes && confirmedRes && (
                          <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-3 space-y-1 shadow-inner">
                            <p className="text-[10px] font-black text-status-warning uppercase tracking-widest">Réservée</p>
                            <p className="text-xs font-bold text-content-primary truncate">{confirmedRes.guest?.full_name}</p>
                            <p className="text-[10px] font-bold text-status-warning/80 uppercase tracking-tighter">{fmt(confirmedRes.check_in)} —{fmt(confirmedRes.check_out)}</p>
                          </div>
                        )}

                        {(room.amenities?.length ?? 0) > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {room.amenities.slice(0, 3).map((a) => (
                              <span key={a} className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-surface-hover text-content-primary border border-surface-border/30">{a}</span>
                            ))}
                          </div>
                        )}
                        
                        <div className="mt-auto pt-4 border-t border-surface-border/50 flex items-baseline justify-between">
                          <div className="flex flex-col">
                            <span className="text-[9px] font-black text-content-muted uppercase tracking-[0.2em]">Tarif</span>
                            <span className="text-sm font-black text-content-primary">{fmtMoney(room.price_per_night, currency)}</span>
                          </div>
                          <span className="text-[10px] font-bold text-content-primary">/nuit</span>
                        </div>

                        {(room.status === 'cleaning' || room.status === 'maintenance') && (
                          <button
                            className="mt-3 text-[10px] py-2 rounded-xl border border-surface-border hover:border-brand-500/50 text-content-secondary hover:text-content-primary transition-all font-bold uppercase tracking-widest bg-surface-input/30"
                            onClick={(e) => { e.stopPropagation(); onMarkAvailable(room.id); }}
                          >
                            Rendre disponible
                          </button>
                        )}
                      </div>

                      {room.status === 'available' && !confirmedRes && (
                        <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-20">
                           <div className="bg-emerald-500 text-content-primary px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest shadow-xl transform translate-y-4 group-hover:translate-y-0 transition-transform">
                             + Réserver
                           </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}


