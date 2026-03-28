'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Plus, Search, BedDouble, Users, Pencil, Trash2, X, Check,
  Calendar, Phone, BadgeCheck, ChevronRight, LogIn, LogOut,
  ClipboardList, AlertCircle,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { logAction } from '@services/supabase/logger';
import { cn } from '@/lib/utils';
import {
  getRooms, createRoom, updateRoom, deleteRoom,
  getGuests, createGuest, updateGuest, deleteGuest,
  getReservations, createReservation, cancelReservation, checkIn, checkOut,
  getServices, addService, deleteService,
  getRoomConflicts, nightsBetween,
} from '@services/supabase/hotel';
import type {
  HotelRoom, HotelGuest, HotelReservation, HotelService,
  RoomType, RoomStatus, ReservationStatus,
} from '@services/supabase/hotel';

// ─── Constantes ───────────────────────────────────────────────────────────────

const ROOM_TYPES: { value: RoomType; label: string }[] = [
  { value: 'simple',    label: 'Simple'    },
  { value: 'double',    label: 'Double'    },
  { value: 'twin',      label: 'Twin'      },
  { value: 'suite',     label: 'Suite'     },
  { value: 'familiale', label: 'Familiale' },
];

const AMENITIES = ['WiFi', 'TV', 'Climatisation', 'Minibar', 'Salle de bain', 'Coffre-fort', 'Balcon', 'Vue mer'];

const ID_TYPES = ['CIN', 'Passeport', 'Titre de séjour', 'Autre'];

// ─── Helpers affichage ────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function tomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
function fmt(date: string): string {
  return new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtMoney(amount: number, currency = 'XOF'): string {
  return new Intl.NumberFormat('fr-FR', { style: 'decimal', maximumFractionDigits: 0 })
    .format(amount) + ' ' + currency;
}

function roomStatusStyle(status: RoomStatus): string {
  switch (status) {
    case 'available':   return 'border-green-700 bg-green-900/20 text-green-300';
    case 'occupied':    return 'border-brand-700 bg-brand-900/20 text-brand-300';
    case 'cleaning':    return 'border-amber-700 bg-amber-900/20 text-amber-300';
    case 'maintenance': return 'border-slate-600 bg-slate-800/40 text-slate-400';
  }
}
function roomStatusLabel(status: RoomStatus): string {
  switch (status) {
    case 'available':   return 'Disponible';
    case 'occupied':    return 'Occupée';
    case 'cleaning':    return 'Nettoyage';
    case 'maintenance': return 'Maintenance';
  }
}
function resStatusStyle(status: ReservationStatus): string {
  switch (status) {
    case 'confirmed':   return 'bg-slate-700 text-slate-200';
    case 'checked_in':  return 'bg-brand-700 text-white';
    case 'checked_out': return 'bg-green-900/40 text-green-300';
    case 'cancelled':   return 'bg-red-900/40 text-red-300';
    case 'no_show':     return 'bg-amber-900/40 text-amber-300';
  }
}
function resStatusLabel(status: ReservationStatus): string {
  switch (status) {
    case 'confirmed':   return 'Confirmée';
    case 'checked_in':  return 'En cours';
    case 'checked_out': return 'Parti';
    case 'cancelled':   return 'Annulée';
    case 'no_show':     return 'No-show';
  }
}

// ─── Types locaux ─────────────────────────────────────────────────────────────

type Tab = 'chambres' | 'reservations' | 'clients';
type ResFilter = 'active' | 'today' | 'all';
type Panel =
  | null
  | { type: 'room';        item: HotelRoom | null }
  | { type: 'guest';       item: HotelGuest | null }
  | { type: 'reservation'; item: HotelReservation | null; defaultRoomId?: string }
  | { type: 'detail';      reservation: HotelReservation };

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HotelPage() {
  const { user, business } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();
  const currency = business?.currency ?? 'XOF';

  // ── Données ──
  const [rooms,        setRooms]        = useState<HotelRoom[]>([]);
  const [guests,       setGuests]       = useState<HotelGuest[]>([]);
  const [reservations, setReservations] = useState<HotelReservation[]>([]);
  const [services,     setServices]     = useState<HotelService[]>([]);

  // ── UI ──
  const [tab,       setTab]       = useState<Tab>('chambres');
  const [resFilter, setResFilter] = useState<ResFilter>('active');
  const [search,    setSearch]    = useState('');
  const [panel,     setPanel]     = useState<Panel>(null);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);

  // ── Formulaires ──
  const emptyRoomForm = {
    number: '', type: 'double' as RoomType, floor: '',
    capacity: 2, price_per_night: '',
    status: 'available' as RoomStatus,
    description: '', amenities: [] as string[], is_active: true,
  };
  const emptyGuestForm = {
    full_name: '', phone: '', email: '',
    id_type: '', id_number: '', nationality: '', address: '', notes: '',
  };
  const emptyResForm = {
    room_id: '', guest_id: '',
    check_in: todayStr(), check_out: tomorrowStr(),
    num_guests: 1, price_per_night: '', notes: '',
  };
  const emptySvcForm = { label: '', amount: '', service_date: todayStr() };

  const [roomForm,  setRoomForm]  = useState(emptyRoomForm);
  const [guestForm, setGuestForm] = useState(emptyGuestForm);
  const [resForm,   setResForm]   = useState(emptyResForm);
  const [svcForm,   setSvcForm]   = useState(emptySvcForm);
  const [checkoutPaid, setCheckoutPaid] = useState('');

  // ── Chargement initial ──
  useEffect(() => {
    if (!business) return;
    loadAll();
  }, [business]);

  async function loadAll() {
    if (!business) return;
    setLoading(true);
    try {
      const [r, g, res] = await Promise.all([
        getRooms(business.id),
        getGuests(business.id),
        getReservations(business.id),
      ]);
      setRooms(r);
      setGuests(g);
      setReservations(res);
    } catch (e) { notifError(String(e)); }
    finally { setLoading(false); }
  }

  // ── Chargement services ──
  async function loadServices(reservationId: string) {
    try {
      setServices(await getServices(reservationId));
    } catch (e) { notifError(String(e)); }
  }

  // ─── CRUD Chambre ──────────────────────────────────────────────────────────

  function openRoomPanel(item: HotelRoom | null) {
    setRoomForm(item ? {
      number: item.number, type: item.type, floor: item.floor ?? '',
      capacity: item.capacity, price_per_night: String(item.price_per_night),
      status: item.status, description: item.description ?? '',
      amenities: item.amenities ?? [], is_active: item.is_active,
    } : emptyRoomForm);
    setPanel({ type: 'room', item });
  }

  async function saveRoom() {
    if (!business || !roomForm.number.trim() || !roomForm.price_per_night) return;
    setSaving(true);
    try {
      const payload = {
        number: roomForm.number.trim(),
        type: roomForm.type,
        floor: roomForm.floor.trim() || null,
        capacity: Number(roomForm.capacity),
        price_per_night: Number(roomForm.price_per_night),
        status: roomForm.status,
        description: roomForm.description.trim() || null,
        amenities: roomForm.amenities,
        is_active: roomForm.is_active,
      };
      if (panel?.type === 'room' && panel.item) {
        const updated = await updateRoom(panel.item.id, payload);
        setRooms((prev) => prev.map((r) => r.id === updated.id ? updated : r));
        success('Chambre mise à jour');
      } else {
        const created = await createRoom(business.id, payload);
        setRooms((prev) => [...prev, created]);
        success('Chambre créée');
      }
      setPanel(null);
    } catch (e) { notifError(String(e)); }
    finally { setSaving(false); }
  }

  async function removeRoom(id: string) {
    if (!confirm('Supprimer cette chambre ?')) return;
    try {
      await deleteRoom(id);
      setRooms((prev) => prev.filter((r) => r.id !== id));
      success('Chambre supprimée');
    } catch (e) { notifError(String(e)); }
  }

  function toggleAmenity(amenity: string) {
    setRoomForm((f) => ({
      ...f,
      amenities: f.amenities.includes(amenity)
        ? f.amenities.filter((a) => a !== amenity)
        : [...f.amenities, amenity],
    }));
  }

  // ─── CRUD Client ──────────────────────────────────────────────────────────

  function openGuestPanel(item: HotelGuest | null) {
    setGuestForm(item ? {
      full_name: item.full_name, phone: item.phone ?? '',
      email: item.email ?? '', id_type: item.id_type ?? '',
      id_number: item.id_number ?? '', nationality: item.nationality ?? '',
      address: item.address ?? '', notes: item.notes ?? '',
    } : emptyGuestForm);
    setPanel({ type: 'guest', item });
  }

  async function saveGuest() {
    if (!business || !guestForm.full_name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        full_name: guestForm.full_name.trim(),
        phone: guestForm.phone.trim() || null,
        email: guestForm.email.trim() || null,
        id_type: guestForm.id_type || null,
        id_number: guestForm.id_number.trim() || null,
        nationality: guestForm.nationality.trim() || null,
        address: guestForm.address.trim() || null,
        notes: guestForm.notes.trim() || null,
      };
      if (panel?.type === 'guest' && panel.item) {
        const updated = await updateGuest(panel.item.id, payload);
        setGuests((prev) => prev.map((g) => g.id === updated.id ? updated : g));
        success('Client mis à jour');
      } else {
        const created = await createGuest(business.id, payload);
        setGuests((prev) => [...prev, created]);
        success('Client ajouté');
      }
      setPanel(null);
    } catch (e) { notifError(String(e)); }
    finally { setSaving(false); }
  }

  async function removeGuest(id: string) {
    if (!confirm('Supprimer ce client ?')) return;
    try {
      await deleteGuest(id);
      setGuests((prev) => prev.filter((g) => g.id !== id));
      success('Client supprimé');
    } catch (e) { notifError(String(e)); }
  }

  // ─── CRUD Réservation ─────────────────────────────────────────────────────

  function openReservationPanel(defaultRoomId?: string) {
    const room = defaultRoomId ? rooms.find((r) => r.id === defaultRoomId) : null;
    setResForm({
      ...emptyResForm,
      room_id: defaultRoomId ?? '',
      price_per_night: room ? String(room.price_per_night) : '',
    });
    setPanel({ type: 'reservation', item: null, defaultRoomId });
  }

  async function saveReservation() {
    if (!business || !user) return;
    if (!resForm.room_id || !resForm.guest_id || !resForm.check_in || !resForm.check_out || !resForm.price_per_night) return;
    if (resForm.check_out <= resForm.check_in) {
      notifError('La date de départ doit être après la date d\'arrivée');
      return;
    }
    setSaving(true);
    try {
      // Vérifier la disponibilité avant de créer
      const conflicts = await getRoomConflicts(resForm.room_id, resForm.check_in, resForm.check_out);
      if (conflicts.length > 0) {
        const c = conflicts[0];
        const guestLabel = c.guest_name ? ` (${c.guest_name})` : '';
        notifError(`Chambre déjà réservée du ${c.check_in} au ${c.check_out}${guestLabel}`);
        setSaving(false);
        return;
      }

      const created = await createReservation(business.id, user.id, {
        room_id:        resForm.room_id,
        guest_id:       resForm.guest_id,
        check_in:       resForm.check_in,
        check_out:      resForm.check_out,
        num_guests:     Number(resForm.num_guests),
        price_per_night: Number(resForm.price_per_night),
        notes:          resForm.notes.trim() || undefined,
      });
      setReservations((prev) => [created, ...prev]);
      logAction({ business_id: business.id, action: 'hotel.reservation.created', entity_type: 'reservation', entity_id: created.id, metadata: { room_id: created.room_id, guest_id: created.guest_id, check_in: created.check_in, check_out: created.check_out, total: created.total } });
      success('Réservation créée');
      setPanel(null);
    } catch (e) { notifError(String(e)); }
    finally { setSaving(false); }
  }

  async function handleCancelReservation(res: HotelReservation) {
    if (!confirm('Annuler cette réservation ?')) return;
    try {
      const updated = await cancelReservation(res.id);
      setReservations((prev) => prev.map((r) => r.id === updated.id ? updated : r));
      if (panel?.type === 'detail') setPanel({ type: 'detail', reservation: updated });
      if (business) logAction({ business_id: business.id, action: 'hotel.reservation.cancelled', entity_type: 'reservation', entity_id: res.id, metadata: { room_id: res.room_id, guest_id: res.guest_id } });
      success('Réservation annulée');
    } catch (e) { notifError(String(e)); }
  }

  async function handleCheckIn(res: HotelReservation) {
    try {
      const updated = await checkIn(res.id, res.room_id);
      setReservations((prev) => prev.map((r) => r.id === updated.id ? updated : r));
      setRooms((prev) => prev.map((r) => r.id === res.room_id ? { ...r, status: 'occupied' } : r));
      if (panel?.type === 'detail') setPanel({ type: 'detail', reservation: updated });
      if (business) logAction({ business_id: business.id, action: 'hotel.checkin', entity_type: 'reservation', entity_id: res.id, metadata: { room_id: res.room_id, guest_id: res.guest_id, check_in: res.check_in } });
      success('Check-in effectué');
    } catch (e) { notifError(String(e)); }
  }

  async function handleCheckOut(res: HotelReservation) {
    const paid = Number(checkoutPaid) || 0;
    try {
      const updated = await checkOut(res.id, res.room_id, paid);
      setReservations((prev) => prev.map((r) => r.id === updated.id ? updated : r));
      setRooms((prev) => prev.map((r) => r.id === res.room_id ? { ...r, status: 'cleaning' } : r));
      setPanel(null);
      if (business) logAction({ business_id: business.id, action: 'hotel.checkout', entity_type: 'reservation', entity_id: res.id, metadata: { room_id: res.room_id, guest_id: res.guest_id, total: updated.total, paid_amount: paid } });
      success('Check-out effectué — chambre en nettoyage');
    } catch (e) { notifError(String(e)); }
  }

  // ─── Prestations ─────────────────────────────────────────────────────────

  async function handleAddService(reservationId: string) {
    if (!business || !svcForm.label.trim() || !svcForm.amount) return;
    setSaving(true);
    try {
      const created = await addService(business.id, reservationId, {
        label:        svcForm.label.trim(),
        amount:       Number(svcForm.amount),
        service_date: svcForm.service_date,
      });
      setServices((prev) => [...prev, created]);
      // Refresh reservation totals
      const updated = reservations.find((r) => r.id === reservationId);
      if (updated) {
        const newTotal = updated.total_room + updated.total_services + Number(svcForm.amount);
        const newRes: HotelReservation = {
          ...updated,
          total_services: updated.total_services + Number(svcForm.amount),
          total: newTotal,
        };
        setReservations((prev) => prev.map((r) => r.id === reservationId ? newRes : r));
        if (panel?.type === 'detail') setPanel({ type: 'detail', reservation: newRes });
      }
      setSvcForm(emptySvcForm);
      success('Prestation ajoutée');
    } catch (e) { notifError(String(e)); }
    finally { setSaving(false); }
  }

  async function handleDeleteService(svc: HotelService, reservationId: string) {
    try {
      await deleteService(svc.id, reservationId);
      setServices((prev) => prev.filter((s) => s.id !== svc.id));
      const updated = reservations.find((r) => r.id === reservationId);
      if (updated) {
        const newTotal = updated.total_room + updated.total_services - svc.amount;
        const newRes: HotelReservation = {
          ...updated,
          total_services: updated.total_services - svc.amount,
          total: newTotal,
        };
        setReservations((prev) => prev.map((r) => r.id === reservationId ? newRes : r));
        if (panel?.type === 'detail') setPanel({ type: 'detail', reservation: newRes });
      }
    } catch (e) { notifError(String(e)); }
  }

  function openDetail(res: HotelReservation) {
    setPanel({ type: 'detail', reservation: res });
    setCheckoutPaid(String(res.total));
    setSvcForm(emptySvcForm);
    loadServices(res.id);
  }

  // ─── Données filtrées ─────────────────────────────────────────────────────

  const today = todayStr();

  const filteredRooms = useMemo(() =>
    rooms.filter((r) =>
      r.number.toLowerCase().includes(search.toLowerCase()) ||
      (r.floor ?? '').toLowerCase().includes(search.toLowerCase())
    ),
  [rooms, search]);

  const filteredReservations = useMemo(() => {
    let list = reservations;
    if (resFilter === 'active') {
      list = list.filter((r) => r.status === 'confirmed' || r.status === 'checked_in');
    } else if (resFilter === 'today') {
      list = list.filter((r) =>
        (r.check_in === today && (r.status === 'confirmed' || r.status === 'checked_in')) ||
        (r.check_out === today && r.status === 'checked_in')
      );
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        r.guest?.full_name.toLowerCase().includes(q) ||
        r.room?.number.toLowerCase().includes(q)
      );
    }
    return list;
  }, [reservations, resFilter, search, today]);

  const filteredGuests = useMemo(() =>
    guests.filter((g) =>
      g.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (g.phone ?? '').includes(search)
    ),
  [guests, search]);

  // Statistiques rapides
  const stats = useMemo(() => ({
    available:   rooms.filter((r) => r.status === 'available').length,
    occupied:    rooms.filter((r) => r.status === 'occupied').length,
    cleaning:    rooms.filter((r) => r.status === 'cleaning').length,
    maintenance: rooms.filter((r) => r.status === 'maintenance').length,
    total:       rooms.length,
  }), [rooms]);

  // Prix chambre sélectionnée dans le formulaire
  const selectedRoomPrice = resForm.room_id
    ? rooms.find((r) => r.id === resForm.room_id)?.price_per_night
    : undefined;
  const resNights = resForm.check_in && resForm.check_out && resForm.check_out > resForm.check_in
    ? nightsBetween(resForm.check_in, resForm.check_out)
    : 0;
  const resTotal = resNights * Number(resForm.price_per_night || 0);

  // Réservation active pour une chambre
  function activeResForRoom(roomId: string): HotelReservation | undefined {
    return reservations.find((r) => r.room_id === roomId && r.status === 'checked_in');
  }

  // ─── Rendu ────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col relative">

      {/* ── Header ── */}
      <div className="px-6 py-4 border-b border-surface-border flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white">Hôtel</h1>
          <p className="text-xs text-slate-500">
            {stats.available} disponible{stats.available !== 1 ? 's' : ''} · {stats.occupied} occupée{stats.occupied !== 1 ? 's' : ''} · {stats.total} chambre{stats.total !== 1 ? 's' : ''} au total
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {(['chambres', 'reservations', 'clients'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setSearch(''); setPanel(null); }}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-medium transition-colors',
                tab === t ? 'bg-brand-600 text-white' : 'btn-secondary'
              )}
            >
              {t === 'chambres' ? <><BedDouble className="w-4 h-4 inline mr-1.5" />Chambres</> :
               t === 'reservations' ? <><ClipboardList className="w-4 h-4 inline mr-1.5" />Réservations</> :
               <><Users className="w-4 h-4 inline mr-1.5" />Clients</>}
            </button>
          ))}
          <div className="h-8 w-px bg-surface-border" />
          {tab === 'chambres' && (
            <button onClick={() => openRoomPanel(null)} className="btn-primary h-9 text-sm flex items-center gap-1.5">
              <Plus className="w-4 h-4 shrink-0" /> Nouvelle chambre
            </button>
          )}
          {tab === 'reservations' && (
            <button onClick={() => openReservationPanel()} className="btn-primary h-9 text-sm flex items-center gap-1.5">
              <Plus className="w-4 h-4 shrink-0" /> Réservation
            </button>
          )}
          {tab === 'clients' && (
            <button onClick={() => openGuestPanel(null)} className="btn-primary h-9 text-sm flex items-center gap-1.5">
              <Plus className="w-4 h-4 shrink-0" /> Nouveau client
            </button>
          )}
        </div>
      </div>

      {/* ── Tab Chambres ── */}
      {tab === 'chambres' && (
        <div className="flex-1 overflow-y-auto p-6">

          {/* Barre de recherche + stats rapides */}
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                className="input pl-8 h-9 text-sm"
                placeholder="Chercher par numéro, étage…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              {[
                { label: 'Disponibles', count: stats.available, color: 'text-green-400' },
                { label: 'Occupées',    count: stats.occupied,   color: 'text-brand-400' },
                { label: 'Nettoyage',   count: stats.cleaning,   color: 'text-amber-400' },
                { label: 'Maintenance', count: stats.maintenance, color: 'text-slate-400' },
              ].map(({ label, count, color }) => (
                <div key={label} className="card px-3 py-1.5 text-center hidden sm:block">
                  <p className={cn('text-lg font-bold', color)}>{count}</p>
                  <p className="text-xs text-slate-500">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {loading && <p className="text-center text-slate-500 py-16">Chargement…</p>}

          {!loading && filteredRooms.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
              <BedDouble className="w-12 h-12 opacity-20" />
              <p>Aucune chambre</p>
              <button onClick={() => openRoomPanel(null)} className="btn-primary h-9 text-sm">Ajouter une chambre</button>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {filteredRooms.map((room) => {
              const activeRes = activeResForRoom(room.id);
              return (
                <div
                  key={room.id}
                  className={cn(
                    'border-2 rounded-2xl p-4 cursor-pointer transition-all hover:scale-[1.02] flex flex-col gap-2',
                    roomStatusStyle(room.status)
                  )}
                  onClick={() => {
                    if (room.status === 'available') {
                      openReservationPanel(room.id);
                    } else if (activeRes) {
                      openDetail(activeRes);
                    } else {
                      openRoomPanel(room);
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-2xl font-black text-white">{room.number}</span>
                    <button
                      className="p-1 rounded-lg hover:bg-white/10 shrink-0"
                      onClick={(e) => { e.stopPropagation(); openRoomPanel(room); }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div>
                    <p className="text-xs font-medium">{ROOM_TYPES.find((t) => t.value === room.type)?.label}</p>
                    {room.floor && <p className="text-xs opacity-70">{room.floor}</p>}
                  </div>
                  <p className="text-xs font-semibold mt-auto">{fmtMoney(room.price_per_night, currency)}/nuit</p>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-medium opacity-80">{roomStatusLabel(room.status)}</span>
                    {room.status === 'available' && (
                      <span className="text-xs bg-green-700/30 border border-green-700 rounded px-1.5 py-0.5">+ Réserver</span>
                    )}
                  </div>
                  {activeRes && (
                    <div className="text-xs opacity-80 border-t border-white/10 pt-2">
                      <p className="font-medium truncate">{activeRes.guest?.full_name}</p>
                      <p>→ {fmt(activeRes.check_out)}</p>
                    </div>
                  )}
                  {(room.status === 'cleaning' || room.status === 'maintenance') && (
                    <button
                      className="text-xs mt-1 border border-white/20 rounded-lg py-1 hover:bg-white/10"
                      onClick={(e) => { e.stopPropagation(); updateRoom(room.id, { status: 'available' }).then((r) => setRooms((p) => p.map((x) => x.id === r.id ? r : x))).catch((e) => notifError(String(e))); }}
                    >
                      Marquer disponible
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Tab Réservations ── */}
      {tab === 'reservations' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 py-3 border-b border-surface-border flex items-center gap-3 flex-wrap">
            <div className="flex gap-1.5">
              {([
                { value: 'active', label: 'En cours' },
                { value: 'today',  label: 'Aujourd\'hui' },
                { value: 'all',    label: 'Toutes' },
              ] as { value: ResFilter; label: string }[]).map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setResFilter(value)}
                  className={cn(
                    'px-3 py-1.5 rounded-xl text-sm transition-colors',
                    resFilter === value ? 'bg-brand-600 text-white' : 'btn-secondary'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                className="input pl-8 h-9 text-sm"
                placeholder="Chercher client, chambre…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
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
                    <div className="w-10 h-10 rounded-full bg-surface-input flex items-center justify-center shrink-0 text-sm font-bold text-brand-400">
                      {res.guest?.full_name.charAt(0).toUpperCase() ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-white truncate">{res.guest?.full_name}</p>
                        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', resStatusStyle(res.status))}>
                          {resStatusLabel(res.status)}
                        </span>
                        {arrivesToday && res.status === 'confirmed' && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/40 text-green-300 border border-green-700">Arrivée</span>
                        )}
                        {departsToday && res.status === 'checked_in' && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-300 border border-amber-700">Départ</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Chambre {res.room?.number} · {nights} nuit{nights > 1 ? 's' : ''} · {fmt(res.check_in)} → {fmt(res.check_out)}
                      </p>
                    </div>
                    <div className="text-right shrink-0 hidden sm:block">
                      <p className="text-sm font-semibold text-white">{fmtMoney(res.total, currency)}</p>
                      {res.paid_amount < res.total && res.status !== 'cancelled' && (
                        <p className="text-xs text-amber-400">
                          Reste {fmtMoney(res.total - res.paid_amount, currency)}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab Clients ── */}
      {tab === 'clients' && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="relative mb-5 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              className="input pl-8 h-9 text-sm"
              placeholder="Chercher par nom, téléphone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loading && <p className="text-center text-slate-500 py-16">Chargement…</p>}

          {!loading && filteredGuests.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
              <Users className="w-12 h-12 opacity-20" />
              <p>Aucun client enregistré</p>
              <button onClick={() => openGuestPanel(null)} className="btn-primary h-9 text-sm">Ajouter un client</button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-5xl">
            {filteredGuests.map((g) => (
              <div key={g.id} className="card p-4 flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-surface-input flex items-center justify-center shrink-0 text-sm font-bold text-brand-400">
                  {g.full_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{g.full_name}</p>
                  {g.phone && <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5"><Phone className="w-3 h-3" />{g.phone}</p>}
                  {g.nationality && <p className="text-xs text-slate-500">{g.nationality}</p>}
                  {g.id_number && <p className="text-xs text-slate-500">{g.id_type} {g.id_number}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openGuestPanel(g)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-surface-hover">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => removeGuest(g.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-900/20">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          Panneaux latéraux
      ════════════════════════════════════════════════════════════════════════ */}

      {/* ── Panneau : Chambre ── */}
      {panel?.type === 'room' && (
        <div className="absolute inset-y-0 right-0 w-96 bg-surface-card border-l border-surface-border shadow-2xl flex flex-col z-40">
          <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
            <h3 className="font-semibold text-white">{panel.item ? 'Modifier chambre' : 'Nouvelle chambre'}</h3>
            <button onClick={() => setPanel(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-surface-hover">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Numéro <span className="text-red-400">*</span></label>
                <input className="input" value={roomForm.number} onChange={(e) => setRoomForm((f) => ({ ...f, number: e.target.value }))} placeholder="101" autoFocus />
              </div>
              <div>
                <label className="label">Étage</label>
                <input className="input" value={roomForm.floor} onChange={(e) => setRoomForm((f) => ({ ...f, floor: e.target.value }))} placeholder="1er" />
              </div>
            </div>
            <div>
              <label className="label">Type</label>
              <select className="input" value={roomForm.type} onChange={(e) => setRoomForm((f) => ({ ...f, type: e.target.value as RoomType }))}>
                {ROOM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Capacité (pers.)</label>
                <input className="input" type="number" min={1} value={roomForm.capacity} onChange={(e) => setRoomForm((f) => ({ ...f, capacity: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="label">Prix / nuit <span className="text-red-400">*</span></label>
                <input className="input" type="number" min={0} value={roomForm.price_per_night} onChange={(e) => setRoomForm((f) => ({ ...f, price_per_night: e.target.value }))} placeholder="0" />
              </div>
            </div>
            <div>
              <label className="label">Statut</label>
              <select className="input" value={roomForm.status} onChange={(e) => setRoomForm((f) => ({ ...f, status: e.target.value as RoomStatus }))}>
                <option value="available">Disponible</option>
                <option value="occupied">Occupée</option>
                <option value="cleaning">Nettoyage</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
            <div>
              <label className="label">Équipements</label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {AMENITIES.map((a) => (
                  <button
                    key={a} type="button"
                    onClick={() => toggleAmenity(a)}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-xs border transition-colors',
                      roomForm.amenities.includes(a)
                        ? 'border-brand-600 bg-brand-900/30 text-brand-300'
                        : 'border-surface-border text-slate-400 hover:border-slate-500'
                    )}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Description</label>
              <textarea className="input min-h-[72px] resize-none text-sm" value={roomForm.description} onChange={(e) => setRoomForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => setRoomForm((f) => ({ ...f, is_active: !f.is_active }))}
                className={cn('w-10 h-6 rounded-full transition-colors', roomForm.is_active ? 'bg-brand-600' : 'bg-slate-700')}
              >
                <span className={cn('block w-4 h-4 bg-white rounded-full shadow mt-1 transition-transform', roomForm.is_active ? 'translate-x-5' : 'translate-x-1')} />
              </div>
              <span className="text-sm text-slate-300">Active</span>
            </label>
          </div>
          <div className="flex gap-2 px-5 py-4 border-t border-surface-border">
            {panel.item && (
              <button onClick={() => removeRoom(panel.item!.id)} className="p-2.5 rounded-xl text-red-400 hover:bg-red-900/20">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={saveRoom}
              disabled={saving || !roomForm.number.trim() || !roomForm.price_per_night}
              className="btn-primary flex-1 h-10 flex items-center justify-center gap-2"
            >
              {saving ? 'Enregistrement…' : <><Check className="w-4 h-4" /> Enregistrer</>}
            </button>
          </div>
        </div>
      )}

      {/* ── Panneau : Client ── */}
      {panel?.type === 'guest' && (
        <div className="absolute inset-y-0 right-0 w-96 bg-surface-card border-l border-surface-border shadow-2xl flex flex-col z-40">
          <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
            <h3 className="font-semibold text-white">{panel.item ? 'Modifier client' : 'Nouveau client'}</h3>
            <button onClick={() => setPanel(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-surface-hover">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div>
              <label className="label">Nom complet <span className="text-red-400">*</span></label>
              <input className="input" value={guestForm.full_name} onChange={(e) => setGuestForm((f) => ({ ...f, full_name: e.target.value }))} placeholder="Prénom Nom" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Téléphone</label>
                <input className="input" value={guestForm.phone} onChange={(e) => setGuestForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <label className="label">Nationalité</label>
                <input className="input" value={guestForm.nationality} onChange={(e) => setGuestForm((f) => ({ ...f, nationality: e.target.value }))} placeholder="Ex : Sénégal" />
              </div>
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={guestForm.email} onChange={(e) => setGuestForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Pièce d'identité</label>
                <select className="input" value={guestForm.id_type} onChange={(e) => setGuestForm((f) => ({ ...f, id_type: e.target.value }))}>
                  <option value="">— Choisir —</option>
                  {ID_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Numéro</label>
                <input className="input" value={guestForm.id_number} onChange={(e) => setGuestForm((f) => ({ ...f, id_number: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="label">Adresse</label>
              <input className="input" value={guestForm.address} onChange={(e) => setGuestForm((f) => ({ ...f, address: e.target.value }))} />
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea className="input min-h-[72px] resize-none text-sm" value={guestForm.notes} onChange={(e) => setGuestForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2 px-5 py-4 border-t border-surface-border">
            {panel.item && (
              <button onClick={() => removeGuest(panel.item!.id)} className="p-2.5 rounded-xl text-red-400 hover:bg-red-900/20">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={saveGuest}
              disabled={saving || !guestForm.full_name.trim()}
              className="btn-primary flex-1 h-10 flex items-center justify-center gap-2"
            >
              {saving ? 'Enregistrement…' : <><Check className="w-4 h-4" /> Enregistrer</>}
            </button>
          </div>
        </div>
      )}

      {/* ── Panneau : Réservation ── */}
      {panel?.type === 'reservation' && (
        <div className="absolute inset-y-0 right-0 w-[420px] bg-surface-card border-l border-surface-border shadow-2xl flex flex-col z-40">
          <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
            <h3 className="font-semibold text-white">Nouvelle réservation</h3>
            <button onClick={() => setPanel(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-surface-hover">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div>
              <label className="label">Chambre <span className="text-red-400">*</span></label>
              <select
                className="input"
                value={resForm.room_id}
                onChange={(e) => {
                  const room = rooms.find((r) => r.id === e.target.value);
                  setResForm((f) => ({
                    ...f,
                    room_id: e.target.value,
                    price_per_night: room ? String(room.price_per_night) : f.price_per_night,
                  }));
                }}
              >
                <option value="">— Choisir —</option>
                {rooms.filter((r) => r.status === 'available').map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.number} — {ROOM_TYPES.find((t) => t.value === r.type)?.label} ({fmtMoney(r.price_per_night, currency)}/nuit)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label !mb-0">Client <span className="text-red-400">*</span></label>
                <button
                  type="button"
                  onClick={() => openGuestPanel(null)}
                  className="text-xs text-brand-400 hover:text-brand-300"
                >
                  + Nouveau client
                </button>
              </div>
              <select className="input" value={resForm.guest_id} onChange={(e) => setResForm((f) => ({ ...f, guest_id: e.target.value }))}>
                <option value="">— Choisir —</option>
                {guests.map((g) => (
                  <option key={g.id} value={g.id}>{g.full_name}{g.phone ? ` — ${g.phone}` : ''}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Arrivée <span className="text-red-400">*</span></label>
                <input
                  className="input"
                  type="date"
                  value={resForm.check_in}
                  onChange={(e) => setResForm((f) => ({ ...f, check_in: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Départ <span className="text-red-400">*</span></label>
                <input
                  className="input"
                  type="date"
                  value={resForm.check_out}
                  min={resForm.check_in}
                  onChange={(e) => setResForm((f) => ({ ...f, check_out: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Nombre de personnes</label>
                <input className="input" type="number" min={1} value={resForm.num_guests} onChange={(e) => setResForm((f) => ({ ...f, num_guests: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="label">Prix / nuit</label>
                <input className="input" type="number" min={0} value={resForm.price_per_night} onChange={(e) => setResForm((f) => ({ ...f, price_per_night: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea className="input min-h-[72px] resize-none text-sm" value={resForm.notes} onChange={(e) => setResForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            {resNights > 0 && resForm.price_per_night && (
              <div className="p-3 rounded-xl bg-brand-900/20 border border-brand-800 text-sm text-brand-300">
                <Calendar className="w-4 h-4 inline mr-1.5" />
                <strong>{resNights} nuit{resNights > 1 ? 's' : ''}</strong> → {fmtMoney(resTotal, currency)}
              </div>
            )}
          </div>
          <div className="px-5 py-4 border-t border-surface-border">
            <button
              onClick={saveReservation}
              disabled={saving || !resForm.room_id || !resForm.guest_id || !resForm.check_in || !resForm.check_out || !resForm.price_per_night}
              className="btn-primary w-full h-10 flex items-center justify-center gap-2"
            >
              {saving ? 'Enregistrement…' : <><Check className="w-4 h-4" /> Créer la réservation</>}
            </button>
          </div>
        </div>
      )}

      {/* ── Panneau : Détail réservation ── */}
      {panel?.type === 'detail' && (() => {
        const res = reservations.find((r) => r.id === panel.reservation.id) ?? panel.reservation;
        const nights = nightsBetween(res.check_in, res.check_out);
        const balance = res.total - res.paid_amount;
        return (
          <div className="absolute inset-y-0 right-0 w-[440px] bg-surface-card border-l border-surface-border shadow-2xl flex flex-col z-40">
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
              <div className="flex items-center gap-2">
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', resStatusStyle(res.status))}>
                  {resStatusLabel(res.status)}
                </span>
                <h3 className="font-semibold text-white">Chambre {res.room?.number}</h3>
              </div>
              <button onClick={() => setPanel(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-surface-hover">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Client */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-surface-input flex items-center justify-center shrink-0 text-sm font-bold text-brand-400">
                  {res.guest?.full_name.charAt(0).toUpperCase() ?? '?'}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{res.guest?.full_name}</p>
                  {res.guest?.phone && <p className="text-xs text-slate-400 flex items-center gap-1"><Phone className="w-3 h-3" />{res.guest.phone}</p>}
                  {res.guest?.nationality && <p className="text-xs text-slate-500">{res.guest.nationality}</p>}
                  {res.guest?.id_number && (
                    <p className="text-xs text-slate-500 flex items-center gap-1"><BadgeCheck className="w-3 h-3" />{res.guest.id_type} {res.guest.id_number}</p>
                  )}
                </div>
              </div>

              {/* Séjour */}
              <div className="card p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />Arrivée</span>
                  <span className="font-medium text-white">{fmt(res.check_in)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />Départ</span>
                  <span className="font-medium text-white">{fmt(res.check_out)}</span>
                </div>
                <div className="flex items-center justify-between text-sm border-t border-surface-border pt-2">
                  <span className="text-slate-400">{nights} nuit{nights > 1 ? 's' : ''} × {fmtMoney(res.price_per_night, currency)}</span>
                  <span className="font-semibold text-white">{fmtMoney(res.total_room, currency)}</span>
                </div>
              </div>

              {/* Prestations */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Prestations</p>
                {services.length === 0 && (
                  <p className="text-xs text-slate-500 py-2">Aucune prestation</p>
                )}
                {services.map((svc) => (
                  <div key={svc.id} className="flex items-center justify-between py-1.5 border-b border-surface-border last:border-0">
                    <div>
                      <p className="text-sm text-white">{svc.label}</p>
                      <p className="text-xs text-slate-500">{fmt(svc.service_date)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{fmtMoney(svc.amount, currency)}</span>
                      {(res.status === 'confirmed' || res.status === 'checked_in') && (
                        <button onClick={() => handleDeleteService(svc, res.id)} className="p-1 text-slate-500 hover:text-red-400">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {(res.status === 'confirmed' || res.status === 'checked_in') && (
                  <div className="flex gap-2 mt-2">
                    <input
                      className="input flex-1 h-8 text-sm"
                      placeholder="Prestation…"
                      value={svcForm.label}
                      onChange={(e) => setSvcForm((f) => ({ ...f, label: e.target.value }))}
                    />
                    <input
                      className="input w-24 h-8 text-sm"
                      type="number"
                      placeholder="Montant"
                      value={svcForm.amount}
                      onChange={(e) => setSvcForm((f) => ({ ...f, amount: e.target.value }))}
                    />
                    <button
                      onClick={() => handleAddService(res.id)}
                      disabled={saving || !svcForm.label.trim() || !svcForm.amount}
                      className="btn-primary h-8 px-3 text-sm flex items-center gap-1 shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Totaux */}
              <div className="card p-4 space-y-1.5">
                <div className="flex justify-between text-sm text-slate-400">
                  <span>Chambre</span><span>{fmtMoney(res.total_room, currency)}</span>
                </div>
                {res.total_services > 0 && (
                  <div className="flex justify-between text-sm text-slate-400">
                    <span>Prestations</span><span>{fmtMoney(res.total_services, currency)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold text-white border-t border-surface-border pt-2">
                  <span>Total</span><span>{fmtMoney(res.total, currency)}</span>
                </div>
                {res.paid_amount > 0 && (
                  <div className="flex justify-between text-sm text-green-400">
                    <span>Payé</span><span>{fmtMoney(res.paid_amount, currency)}</span>
                  </div>
                )}
                {balance > 0 && res.status !== 'cancelled' && (
                  <div className="flex justify-between text-sm text-amber-400">
                    <span>Reste à payer</span><span>{fmtMoney(balance, currency)}</span>
                  </div>
                )}
              </div>

              {/* Montant payé (checkout) */}
              {res.status === 'checked_in' && (
                <div>
                  <label className="label">Montant encaissé (check-out)</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={checkoutPaid}
                    onChange={(e) => setCheckoutPaid(e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="px-5 py-4 border-t border-surface-border space-y-2">
              {res.status === 'confirmed' && (
                <button
                  onClick={() => handleCheckIn(res)}
                  className="w-full h-10 rounded-xl bg-green-700 hover:bg-green-600 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  <LogIn className="w-4 h-4" /> Check-in
                </button>
              )}
              {res.status === 'checked_in' && (
                <button
                  onClick={() => handleCheckOut(res)}
                  className="w-full h-10 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  <LogOut className="w-4 h-4" /> Check-out & encaisser
                </button>
              )}
              {(res.status === 'confirmed' || res.status === 'checked_in') && (
                <button
                  onClick={() => handleCancelReservation(res)}
                  className="w-full h-9 rounded-xl border border-red-800 text-red-400 hover:bg-red-900/20 text-sm flex items-center justify-center gap-2 transition-colors"
                >
                  <AlertCircle className="w-4 h-4" /> Annuler la réservation
                </button>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
