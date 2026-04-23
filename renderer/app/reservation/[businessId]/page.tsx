'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  BedDouble, Users, Star, Wifi, Wind, Tv, Coffee, Car,
  Calendar, MapPin, Phone, Loader2, AlertCircle, Check,
  ChevronRight, ChevronLeft, Hotel, X, Search,
} from 'lucide-react';
import {
  getPublicHotelInfo, getAvailableRooms, createPublicReservation,
  type PublicHotelInfo, type PublicRoom,
} from '@services/supabase/hotel-public';
import { formatCurrency } from '@/lib/utils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROOM_TYPE_LABELS: Record<string, string> = {
  simple:    'Chambre Simple',
  double:    'Chambre Double',
  twin:      'Lits Jumeaux',
  suite:     'Suite',
  familiale: 'Familiale',
};

const ROOM_TYPE_COLORS: Record<string, string> = {
  simple:    'bg-blue-50 text-blue-700 border-blue-200',
  double:    'bg-purple-50 text-purple-700 border-purple-200',
  twin:      'bg-indigo-50 text-indigo-700 border-indigo-200',
  suite:     'bg-amber-50 text-amber-700 border-amber-200',
  familiale: 'bg-green-50 text-green-700 border-green-200',
};

const AMENITY_ICONS: Record<string, React.ReactNode> = {
  'WiFi':        <Wifi    className="w-3.5 h-3.5" />,
  'Climatiseur': <Wind    className="w-3.5 h-3.5" />,
  'TV':          <Tv      className="w-3.5 h-3.5" />,
  'Minibar':     <Coffee  className="w-3.5 h-3.5" />,
  'Parking':     <Car     className="w-3.5 h-3.5" />,
  'Piscine':     <Star    className="w-3.5 h-3.5" />,
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function tomorrowStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
function nightsBetween(from: string, to: string) {
  return Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000));
}
function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ─── Composant RoomCard ───────────────────────────────────────────────────────

interface RoomCardProps {
  room:     PublicRoom;
  currency: string;
  nights:   number;
  onSelect: (room: PublicRoom) => void;
}

function RoomCard({ room, currency, nights, onSelect }: RoomCardProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition-shadow">
      {/* Visuel */}
      <div className="h-36 bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center relative">
        <BedDouble className="w-14 h-14 text-slate-300" />
        <span className={`absolute top-3 left-3 text-xs font-bold px-2.5 py-1 rounded-full border ${ROOM_TYPE_COLORS[room.type] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>
          {ROOM_TYPE_LABELS[room.type] ?? room.type}
        </span>
        {room.floor && (
          <span className="absolute top-3 right-3 text-xs text-slate-500 bg-white/80 px-2 py-0.5 rounded-full">
            Étage {room.floor}
          </span>
        )}
      </div>

      <div className="p-4 space-y-3">
        {/* Titre */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-bold text-slate-900">Chambre {room.number}</h3>
            <div className="flex items-center gap-1.5 mt-0.5 text-slate-500 text-xs">
              <Users className="w-3.5 h-3.5" />
              <span>{room.capacity} personne{room.capacity > 1 ? 's' : ''} max</span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="font-black text-brand-600 text-lg leading-none">
              {formatCurrency(room.price_per_night, currency)}
            </p>
            <p className="text-xs text-slate-400">/ nuit</p>
          </div>
        </div>

        {/* Description */}
        {room.description && (
          <p className="text-xs text-slate-500 line-clamp-2">{room.description}</p>
        )}

        {/* Équipements */}
        {room.amenities?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {room.amenities.slice(0, 5).map((a) => (
              <span key={a} className="flex items-center gap-1 text-xs text-slate-500 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-full">
                {AMENITY_ICONS[a] ?? <Star className="w-3 h-3" />}
                {a}
              </span>
            ))}
            {room.amenities.length > 5 && (
              <span className="text-xs text-slate-400">+{room.amenities.length - 5}</span>
            )}
          </div>
        )}

        {/* Total + CTA */}
        <div className="flex items-center justify-between pt-1">
          {nights > 1 && (
            <p className="text-xs text-slate-500">
              {nights} nuits = <span className="font-semibold text-slate-700">{formatCurrency(room.price_per_night * nights, currency)}</span>
            </p>
          )}
          <button
            onClick={() => onSelect(room)}
            className="ml-auto flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
          >
            Réserver <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function ReservationPage() {
  const { businessId } = useParams<{ businessId: string }>();
  const router = useRouter();

  // Données
  const [info,    setInfo]    = useState<PublicHotelInfo | null>(null);
  const [rooms,   setRooms]   = useState<PublicRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  // Dates
  const [checkIn,  setCheckIn]  = useState(todayStr());
  const [checkOut, setCheckOut] = useState(tomorrowStr());

  // Filtres
  const [typeFilter,     setTypeFilter]     = useState<string>('');
  const [capacityFilter, setCapacityFilter] = useState<number>(1);

  // Chambre sélectionnée + formulaire réservation
  const [selectedRoom, setSelectedRoom] = useState<PublicRoom | null>(null);
  const [guestName,    setGuestName]    = useState('');
  const [guestPhone,   setGuestPhone]   = useState('');
  const [guestEmail,   setGuestEmail]   = useState('');
  const [numGuests,    setNumGuests]    = useState(1);
  const [notes,        setNotes]        = useState('');
  const [submitting,   setSubmitting]   = useState(false);
  const [submitError,  setSubmitError]  = useState<string | null>(null);

  // Charger les infos du business
  useEffect(() => {
    if (!businessId) return;
    getPublicHotelInfo(businessId).then(setInfo).catch(() => setLoadErr("Hôtel introuvable."));
  }, [businessId]);

  const nights = nightsBetween(checkIn, checkOut);

  async function searchRooms() {
    if (!businessId || checkOut <= checkIn) return;
    setLoading(true);
    setLoadErr(null);
    setSearched(true);
    try {
      const available = await getAvailableRooms(businessId, checkIn, checkOut);
      setRooms(available);
    } catch {
      setLoadErr("Impossible de vérifier les disponibilités. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  const filteredRooms = useMemo(() => {
    return rooms.filter((r) => {
      if (typeFilter && r.type !== typeFilter) return false;
      if (r.capacity < capacityFilter) return false;
      return true;
    });
  }, [rooms, typeFilter, capacityFilter]);

  async function handleReserve(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRoom || !info) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const result = await createPublicReservation({
        business_id:  info.id,
        room_id:      selectedRoom.id,
        guest_name:   guestName.trim(),
        guest_phone:  guestPhone.trim(),
        guest_email:  guestEmail.trim() || undefined,
        check_in:     checkIn,
        check_out:    checkOut,
        num_guests:   numGuests,
        notes:        notes.trim() || undefined,
      });
      router.push(`/reservation/${businessId}/confirmation/${result.confirmation_token}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Une erreur est survenue. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!info && !loadErr) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-brand-600" />
      </div>
    );
  }

  if (loadErr && !info) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 text-center max-w-sm w-full space-y-4">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <p className="font-semibold text-slate-800">{loadErr}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-16">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-100 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          {info?.logo_url ? (
            <img src={info.logo_url} alt={info?.name} className="w-10 h-10 rounded-xl object-cover shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center shrink-0">
              <Hotel className="w-5 h-5 text-white" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="font-bold text-slate-900 text-base truncate">{info?.name}</h1>
            {info?.address && (
              <p className="text-xs text-slate-400 truncate flex items-center gap-1">
                <MapPin className="w-3 h-3 shrink-0" />{info.address}
              </p>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* ── Sélecteur de dates ─────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-4">
          <h2 className="font-bold text-slate-900 text-lg flex items-center gap-2">
            <Calendar className="w-5 h-5 text-brand-500" />
            Vos dates de séjour
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Arrivée</label>
              <input
                type="date"
                value={checkIn}
                min={todayStr()}
                onChange={(e) => {
                  setCheckIn(e.target.value);
                  if (e.target.value >= checkOut) {
                    const d = new Date(e.target.value);
                    d.setDate(d.getDate() + 1);
                    setCheckOut(d.toISOString().slice(0, 10));
                  }
                  setSearched(false);
                  setRooms([]);
                }}
                className="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Départ</label>
              <input
                type="date"
                value={checkOut}
                min={checkIn}
                onChange={(e) => { setCheckOut(e.target.value); setSearched(false); setRooms([]); }}
                className="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          {nights > 0 && (
            <p className="text-xs text-slate-500 text-center">
              {nights} nuit{nights > 1 ? 's' : ''} · {fmtDate(checkIn)} → {fmtDate(checkOut)}
            </p>
          )}

          <button
            onClick={searchRooms}
            disabled={loading || checkOut <= checkIn}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-bold py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Recherche…</>
            ) : (
              <><Search className="w-5 h-5" /> Voir les chambres disponibles</>
            )}
          </button>
        </div>

        {/* ── Erreur ──────────────────────────────────────────────────────── */}
        {loadErr && searched && (
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {loadErr}
          </div>
        )}

        {/* ── Résultats ─────────────────────────────────────────────────── */}
        {searched && !loading && (
          <>
            {/* Filtres */}
            {rooms.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">Tous les types</option>
                  {[...new Set(rooms.map((r) => r.type))].map((t) => (
                    <option key={t} value={t}>{ROOM_TYPE_LABELS[t] ?? t}</option>
                  ))}
                </select>
                <select
                  value={capacityFilter}
                  onChange={(e) => setCapacityFilter(Number(e.target.value))}
                  className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>{n}+ personne{n > 1 ? 's' : ''}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 ml-auto">
                  {filteredRooms.length} chambre{filteredRooms.length !== 1 ? 's' : ''} disponible{filteredRooms.length !== 1 ? 's' : ''}
                </p>
              </div>
            )}

            {filteredRooms.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-10 text-center space-y-3">
                <BedDouble className="w-12 h-12 text-slate-200 mx-auto" />
                <p className="font-semibold text-slate-700">
                  {rooms.length === 0 ? 'Aucune chambre disponible pour ces dates' : 'Aucune chambre correspond à vos critères'}
                </p>
                <p className="text-sm text-slate-400">Essayez d'autres dates ou modifiez vos filtres.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filteredRooms.map((room) => (
                  <RoomCard
                    key={room.id}
                    room={room}
                    currency={info!.currency}
                    nights={nights}
                    onSelect={setSelectedRoom}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Message initial */}
        {!searched && (
          <div className="text-center py-12 space-y-3 text-slate-400">
            <Hotel className="w-14 h-14 mx-auto opacity-20" />
            <p className="text-sm">Choisissez vos dates pour voir les chambres disponibles</p>
          </div>
        )}
      </main>

      {/* ── Modal formulaire réservation ───────────────────────────────────── */}
      {selectedRoom && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 sm:p-4">
          <div
            className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl shadow-2xl max-h-[95vh] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center gap-3 p-5 border-b border-slate-100">
              <button
                onClick={() => setSelectedRoom(null)}
                className="p-2 rounded-full hover:bg-slate-100"
              >
                <ChevronLeft className="w-5 h-5 text-slate-500" />
              </button>
              <div className="flex-1 min-w-0">
                <h2 className="font-bold text-slate-900">Réserver — Chambre {selectedRoom.number}</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {ROOM_TYPE_LABELS[selectedRoom.type]} · {nights} nuit{nights > 1 ? 's' : ''} · {formatCurrency(selectedRoom.price_per_night * nights, info!.currency)}
                </p>
              </div>
            </div>

            <form onSubmit={handleReserve} className="flex-1 overflow-y-auto p-5 space-y-4">

              {/* Récap chambre */}
              <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-brand-800 text-sm">Chambre {selectedRoom.number}</p>
                  <p className="text-xs text-brand-600 mt-0.5">
                    {fmtDate(checkIn)} → {fmtDate(checkOut)} · {nights} nuit{nights > 1 ? 's' : ''}
                  </p>
                </div>
                <p className="font-black text-brand-700 text-xl shrink-0">
                  {formatCurrency(selectedRoom.price_per_night * nights, info!.currency)}
                </p>
              </div>

              {/* Infos voyageur */}
              <section className="space-y-3">
                <h3 className="font-semibold text-slate-700 text-sm uppercase tracking-wide">Vos informations</h3>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Nom complet *</label>
                  <input
                    required
                    type="text"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Ex : Amadou Diallo"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    <span className="flex items-center gap-1"><Phone className="w-3 h-3" />Numéro WhatsApp *</span>
                  </label>
                  <input
                    required
                    type="tel"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    placeholder="+221 77 000 00 00"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Email (optionnel)</label>
                  <input
                    type="email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder="votre@email.com"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" />Nombre de personnes *</span>
                  </label>
                  <select
                    value={numGuests}
                    onChange={(e) => setNumGuests(Number(e.target.value))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    {Array.from({ length: selectedRoom.capacity }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>{n} personne{n > 1 ? 's' : ''}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Demandes spéciales (optionnel)</label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Arrivée tardive, lit bébé, allergies…"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </section>

              {submitError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {submitError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-bold py-4 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Réservation en cours…</>
                ) : (
                  `Confirmer la réservation · ${formatCurrency(selectedRoom.price_per_night * nights, info!.currency)}`
                )}
              </button>

              <p className="text-xs text-slate-400 text-center">
                Le règlement se fait à l'hôtel lors de votre arrivée. Votre réservation sera confirmée par WhatsApp.
              </p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
